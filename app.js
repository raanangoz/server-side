//requires and initialazations
var express = require('express');
var app = express();
var DButilsAzure = require('./DButils');
var util = require('util');
var bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const secret = 'secret';
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
var cors = require('cors');
app.use(cors());

const user_column_names = ['User_name','First_name','Last_name','City','Country', 'Password', 'Email'];
const userInterest_column_names = ['User_name', 'Category_name'];
const userFavorites_column_names = ['User_name', 'POI_ID', 'POI_name', 'add_Date'];
const retrievalQuestions_column_names = ['User_name', 'Question', 'Answer'];

app.use("/", function(req,res,next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-auth-token, Access-Control-Allow-Headers, X-Requested-With');
    res.setHeader('Access-Control-Allow-Methods', 'POST,GET,PUT,DELETE, OPTIONS');
    next();
});

var port = 3000;
app.listen(port, function () {
    console.log('Example app listening on port ' + port);
});

app.use("/private",function (req,res,next){
    validToken(req,res,next)
});

function validToken(req, res, next) {

    // console.log(req.header);

    const token = req.header('x-auth-token');
    console.log(token);
    // no token
    if (!token) res.status(401).send("Access denied. No token provided.");
    // verify token
    try {
        const decoded = jwt.verify(token, secret);
        var userId = decoded.username;
        req.username = userId;
        req.decoded = decoded;
        // console.log(req);
        next();
    } catch (exception) {

        res.status(400).send("Invalid token.");
    }
}

function surround_with_quotes(string_to_surround){
    return util.format("\'%s\'",string_to_surround)
}

async function create_token(username){
    let payload = {username: username, admin: false};
    let options = {expiresIn: "365d"};
    const token = jwt.sign(payload, secret, options);
    return token;
}

let delete_query = (tableName, where_conditions_array) => {
    return new Promise((resolve, reject) => {
        var where_condition = where_conditions_array.join(' AND ');
        var query = util.format("DELETE FROM %s\n" +
            "WHERE %s",tableName,where_condition);
        console.log("ATTEMPTING TO EXECUTE QUERY:\n"+query);
        DButilsAzure.execQuery(query)
            .then(function (res) {
                resolve(res)
            })
            .catch(function (err) {
                reject(err)
            })
    })
};

function get_insert_query(table_name, cols_names_array, cols_values_array){
    var column_names = cols_names_array.join(', ');
    var column_values = cols_values_array.join(', ');
    var query = util.format('INSERT INTO %s (%s)\n' +
        'VALUES (%s)',
        table_name,column_names,column_values);
    return query;
}

let select_query = (table_name,cols_to_select_array, where_conditions_array) => {
    return new Promise(
        ((resolve, reject) =>{
            var cols = ((typeof cols_to_select_array === 'string' || cols_to_select_array instanceof String) && cols_to_select_array == '*')//check if string and equal to "*"
                ?'*':cols_to_select_array.join(', ');
            var query = util.format('SELECT %s\n' +
                'FROM %s'
                ,cols, table_name);
            if(where_conditions_array && where_conditions_array.length>0){
                query+="\nWHERE "+where_conditions_array.join(" AND ");
            }
            console.log(util.format('Attempting to perform select query:\n%s',query));
            DButilsAzure.execQuery(query)
                .then(function (res) {
                    resolve(res)
                })
                .catch(function (err) {
                    reject(err)
                })
        })
    );
};

app.get ('/get_poi_details/:poi_id', function(req, res){
    var poi_id = req.params['poi_id'];
    try {
        var where_conditions = [util.format("poi_id=%s",poi_id)];
        select_query('POI','*',where_conditions)
            .then(function (poi_result) {
                var reviews_table_name = 'reviews';
                var reviews_rows = ['content','date'];
                var reviews_where_condition = [util.format('POI_ID=%s',poi_id)];
                select_query(reviews_table_name,reviews_rows,reviews_where_condition)
                    .then(function (reviews_result) {
                        var reviews = [];
                        if(reviews_result) {
                            for (let i = 0; i < reviews_result.length; i++) {
                                reviews.push({
                                    content: reviews_result[i]['content'],
                                    date: reviews_result[i]['date']
                                })
                            }
                        }
                        var json_to_send = {
                            name:poi_result[0]['name'],
                            viewsAmount:poi_result[0]['view_amount'],
                            description:poi_result[0]['Description'],
                            category:poi_result[0]['Category_name'],
                            reviews:reviews,
                            picture:poi_result[0]['Picture'],
                        };
                        res.json(json_to_send)
                    })
                    .catch(function (error) {
                        res.send(error);
                    })
            })
            .catch(function (result) {
                res.send(result);
            })
    }
    catch (e) {
        res.send(e);
    }
});

app.post('/login',function (req,res) {
    var username = req.body['username'];
    var password = req.body['password'] ;
    select_query('users',['User_name'],[util.format("User_name='%s'",username),util.format("Password=\'%s\'",password)])
        .then(async function (result) {
            if (result && result.length > 0) {
                const token = await create_token(username);
                res.send(token);

            } else {
                res.status(404).send('Incorrect username and password');
            }
        })
        .catch(function (error) {
            res.send(error);
        })
});

app.get('/get_retrieval_questions_for_user/:username',function (req, res) {
    console.log(req.body);
    var username = req.params["username"];
    select_query('retrievalQuestions',['Question'],[util.format('User_name=\'%s\'',username)])
        .then(function (result) {
            var questions = [];
            for (let i = 0; i < result.length; i++) {
                var question = result[i]['Question'];
                questions.push(question);
            }
            var json_to_send = {
                questions:questions
            };
            res.json(json_to_send);
        })
});

app.post('/register',function (req,res) {
    var firstname=req.body['firstname'], lastname=req.body['lastname'], city=req.body['city'],
        country=req.body['country'], email=req.body['email'], username=req.body['username'],
        password=req.body['password'], favorite_categories=req.body['interests'],
        questions=req.body['questions'],answers=req.body['answers'];
    var user_values = [surround_with_quotes(username),surround_with_quotes(firstname),surround_with_quotes(lastname),surround_with_quotes(city),surround_with_quotes(country),surround_with_quotes(password),surround_with_quotes(email)];
    //check all paramaters recieved
    var legalPassword = true;

    if (!(password.match("^[A-Za-z0-9]+$"))) {
        res.status(400).send("password must contain only digits and letters");
    }
     if ( password.length < 5 || password.length > 10){
         res.status(400).send('password must be between 5 and 10 characters');
     }
    if(questions[0]==questions[1]){
        res.status(400).send('Please choose two different questions');
    }
    if(favorite_categories.length<2){
        res.status(400).send('Please choose two categories');
    }
    else if(!(favorite_categories && favorite_categories.length>0 && firstname && lastname && city
        && country && email && username && password && favorite_categories)){

        res.status(400).send('missing parameters')
    }
     else if (username.length <3 || username.length > 8){
    
         res.status(400).send('username must be between 3 and 8 characters');
     }
    else if (!(username.match("^[A-Za-z]+$"))) {

        res.status(400).send("username must contain only letters");
    }
    // else if (answers.length<2){
    //
    //     //TODO res.status(400).send("You have to insert at least two validation answers")
    // }
    else {
        var insert_userInterest_queries = [];
        for (let i = 0; i < favorite_categories.length; i++) {
            insert_userInterest_queries.push(get_insert_query('userInterests',userInterest_column_names,[surround_with_quotes(username),surround_with_quotes(favorite_categories[i])]));
        }
        var insert_userInterest_transaction_query = util.format("BEGIN TRANSACTION;\n" +
            "%s;\n" +
            "COMMIT TRANSACTION;",insert_userInterest_queries.join(';\n'));
        var inset_user_query = get_insert_query('users', user_column_names, user_values);
        console.log(util.format("ATTEMPTING TO EXECUTE QUERY:\n%s",inset_user_query));
        DButilsAzure.execQuery(inset_user_query)
            .then(function (result1) {

                console.log(util.format("ATTEMPTING TO EXECUTE QUERY:\n%s", insert_userInterest_transaction_query));
                DButilsAzure.execQuery(insert_userInterest_transaction_query)
                    .then(function (result2) {


                        for (let i = 0; i < questions.length; i++) {

                            if(answers[i]!=null) {
                                var save_values = [surround_with_quotes(username), surround_with_quotes(questions[i]), surround_with_quotes(answers[i])];

                                var insert_rq_query = get_insert_query('retrievalQuestions', retrievalQuestions_column_names, save_values);
                                console.log(util.format("ATTEMPTING TO EXECUTE QUERY:\n%s", insert_rq_query));
                                DButilsAzure.execQuery(insert_rq_query).then
                                (function (res4){
                                    // res.status(200).send("success to insert to rq table");
                                })
                                    .catch(function (err4){
                                        res.status(400).send("failed to insert to rq table");
                                    })
                            }
                        }//for
                        res.status(200).send('registration completed successfully');
                    })//thenresult2
                    .catch(function (err2) {
                        var delete_where_conditions = [];
                        for (let i = 0; i < user_column_names.length; i++) {
                            delete_where_conditions.push(util.format('%s=%s', user_column_names[i], (user_values[i])));
                        }
                        delete_query('users', delete_where_conditions)
                            .then(function (result3) {
                                res.status(400).send(err1 + '\nNo registration completed')
                            })
                            .catch(function (err3) {
                                res.status(400).send(util.format('First error:\n%s\nSecond Error:%s\nUSER CREATED, NO CATEGORIES INSERTED, USER NOT DELETED', err1, err2))
                            })
                    })
            })
            .catch(function (err1) {
                res.status(400).send("username is already taken");
            })
    }
});

app.post('/validate_usernames_answers',function (req,res) {//TODO how to use?
    var username = req.body['username'];
    var question = req.body['question'];
    var answer = req.body['answer'];
    // for (let i = 0; i < question.length && answers_are_valid; i++) {
    var where_conditions=[];
    where_conditions.push(util.format('User_name=\'%s\'',username));
    where_conditions.push(util.format('Question=\'%s\'',question));
    // where_conditions.push(util.format('Answer=\'%s\'',answer));
    select_query('retrievalQuestions','*',where_conditions)
        .then(function (result) {
            if((result && result.length>0)) {
                if((result[0]['Answer'])==(answer)) {
                    select_query('users', ['Password'], [util.format("User_name=\'%s\'", username)])
                        .then(function (result) {
                            var password = result[0]['Password'];
                            var json_to_send = {password: password};
                            res.json(json_to_send);
                        })
                        .catch(function (err) {
                            res.status(500).send(err);
                        })

                }
                else {
                    res.status(400).send("Wrong answer!");
                }
            }
            else {
                res.status(400).send("error");
            }
        })
        .catch(function (err) {
            res.status(500).send(err);
        })

});

app.get('/get_POIs/:categories',function (req,res) {
    var cat = req.params["categories"];
    var where_conditions = [];
    if(cat){
        var categories_surrounded_by_quotes = [];
        categories_surrounded_by_quotes.push(surround_with_quotes(cat))
    }
    where_conditions.push(util.format("Category_name in (%s)",categories_surrounded_by_quotes.join(', ')));
    select_query('POI', ['*'],where_conditions)
        .then(function (desired_pois_as_tuple) {
            var desired_pois = [];
            for (let i = 0; i < desired_pois_as_tuple.length; i++) {
                desired_pois.push(desired_pois_as_tuple[i]);
            }
            poi_ids = desired_pois;
            console.log('length: '+poi_ids.length);
            var json_to_return = {pois:poi_ids};
            res.json(poi_ids)
            //  }
        })
        .catch(function (err) {
            res.status(500).send(err)
        })
});

app.get('/search_poi/:poi_name', function(req, res){
    var POI_NAME = req.params["poi_name"];
    select_query('POI',['*'],[util.format('name=\'%s\'',POI_NAME)])
        .then(function (result) {
            var json_to_send = result;
            res.json(json_to_send);
        })
        .catch(function (err) {
            console.log(err);
            res.send(err);
        })
});

app.get('/get_countries', function(req, res){
    select_query('country','*')
        .then(function (result) {

            res.send(result);

        })
        .catch(function (error) {

            res.send(error);
        })
});

app.get('/get_validation_questions', function(req, res){
    select_query('ValidationQuestions','*')
        .then(function (result) {
            res.send(result);
        })
        .catch(function (error) {
            res.send(error);
        })
});

app.post('/private/save_user_favorites',function (req,res) {
    var username=req.username, poi_id=req.body['poi_id'], poi_name=req.body['poi_name'], Date='GETDATE()';
    var save_values = [surround_with_quotes(username),surround_with_quotes(poi_id),surround_with_quotes(poi_name),Date];//TODO ADD DATE TO LATE COLUMN, AND ALSO ON COLUMN NAMES]
    if(!(username && poi_id && poi_name)){
        res.status(400).send('missing parameters')
    }
    else {
        var inset_user_query = get_insert_query('userFavorites', userFavorites_column_names, save_values);
        console.log(util.format("ATTEMPTING TO EXECUTE QUERY:\n%s",inset_user_query));
        DButilsAzure.execQuery(inset_user_query)
            .then(function (result1) {
                res.status(200).send('saving favorites completed successfully');
            })
            .catch(function (err1) {
                res.status(400).send(err1);
            })
            .catch(function (err) {
                res.send(err);
            })
    }
});

app.get('/private/get_FavoritePOIs',function (req,res) {//TODO WHAT IS IT
    var username = req.username;
    var query="SELECT POI.* FROM POI JOIN userFavorites ON POI.POI_ID=userFavorites.POI_ID WHERE [User_name] = '".concat(username,"'");
    DButilsAzure.execQuery(query)
        .then(function (desired_pois_as_tuple) {
            var desired_pois = [];
            for (let i = 0; i < desired_pois_as_tuple.length; i++) {
                desired_pois.push(desired_pois_as_tuple[i]);
            }
            res.json(desired_pois);
        })
        .catch(function (err) {
            res.status(500).send(err)
        })
});

app.delete('/private/delete_FavoritePOIs',function (req,res) {
    //TODO MAYBE PARAM
    //TODO return success
    var username=req.username, poi_id=req.body['poi_id'];
    var query = 'DELETE FROM userFavorites WHERE [User_name] = '.concat("'",username,"' AND [POI_ID] = '",poi_id,"'");
    DButilsAzure.execQuery(query)
        .then(function (result) {
            res.send(result);
        })
        .catch(function (error) {
            res.send(error);
        })
});

app.get('/get_3_random_popular_pois',function (req,res) {//TODO NOT RANDOM
    DButilsAzure.execQuery('SELECT * FROM POI WHERE Rank >= 3.5')
        .then(function(result){
            res.send(result)
        })
        .catch(function(err){
            res.send(err)
        })
});

app.get('/private/get_last_2_favorites',function (req,res) {//todo check if work after we fix date on insertion.
    var username=req.username;
    var query = 'SELECT TOP 2 * FROM POI INNER JOIN userFavorites ON POI.POI_ID = userFavorites.POI_ID WHERE userFavorites.User_name ='.concat("'",username,"'")+'ORDER BY userFavorites.add_Date DESC';
    DButilsAzure.execQuery(query)
        .then(function (result) {
            res.json(result);
        })
        .catch(function (error) {
            res.send(error);
        })
});

app.get('/get_2_last_reviews/:poi_id',function (req,res) {
    //TODO CHECK
    var poi_id = req.params["poi_id"];
    var query = 'SELECT TOP 2 * FROM Reviews WHERE POI_ID ='.concat(poi_id, " ORDER BY Date DESC");
    DButilsAzure.execQuery(query)
        .then(function (result) {
            res.json(result);
        })
        .catch(function (error) {
            res.send(error);
        })
});

app.put('/update_poi_views/:poi_id',function (req,res) {

    var poi_id = req.params["poi_id"];
    var query = "UPDATE POI \n" +
        "SET view_amount = ((SELECT view_amount FROM POI WHERE POI_ID = " +poi_id +")) + 1 \n" +
        "WHERE POI_ID = " +poi_id ;
    DButilsAzure.execQuery(query)
        .then(function (result) {
            res.json(result);
        })
        .catch(function (error) {
            res.send(error);
        })
});

app.post('/private/add_review_to_POI',function (req,res) {
    //TODO CHECK
    var poi_id = req.body["poi_id"], content = req.body["content"], rating = req.body["rating"], username=req.username, Date='GETDATE()';
    var max = 1;
    var query = 'SELECT reviewID FROM reviews WHERE reviewID=(SELECT max(reviewID) FROM reviews)';
    var max_res;
    DButilsAzure.execQuery(query)
        .then(function(result){
            max_res = result;
            max = max_res[0].reviewID + 1;
            req.body.content = req.body.content.replace("'","''");
            var check = "IF NOT EXISTS (SELECT * FROM reviews WHERE User_name = '".concat(username,"' and POI_ID = ",poi_id,") BEGIN ");
            query = check.concat('INSERT INTO reviews (reviewID, content, Date, rating, POI_ID, User_name) VALUES ('.concat(max,", '",content,"',",Date,",",rating,",'", poi_id,"','",username,"'",')')," END;");
            DButilsAzure.execQuery(query)
                .then(function(result){
                    res.send(result);
                    var sum = 0;
                    var count = 0;
                    var count_query = 'SELECT COUNT(*) FROM reviews WHERE POI_ID = '.concat("'",poi_id,"'");
                    DButilsAzure.execQuery(count_query)
                        .then(function(result){
                            for (var key in result[0]) {
                                count = result[0][key];
                            }
                            var sum_query = 'SELECT SUM(rating) FROM reviews WHERE POI_ID = '.concat("'",poi_id,"'");
                            DButilsAzure.execQuery(sum_query)
                                .then(function(result){
                                    for (var key in result[0]) {
                                        sum = result[0][key];
                                    }
                                    var rank = sum / count;
                                    var update_query = 'UPDATE POI SET Rank = '.concat(rank," WHERE POI_ID= ",poi_id);
                                    DButilsAzure.execQuery(update_query)
                                        .then(function(result){
                                        })
                                        .catch(function(err){

                                            res.send(err)
                                        })
                                })
                                .catch(function(err){
                                    console.log(err);

                                    res.send(err)
                                });
                        })
                        .catch(function(err){
                            console.log(err);
                            res.send(err)
                        });
                })
                .catch(function(err){
                    console.log(err);
                    res.send(err)
                });
        })
        .catch(function(err){
            console.log(err);
            res.send(err)
        });
});

app.get('/private/get_userInterests', function (req, res) {
    var username = req.username;
    var where_conditions = [util.format("User_name= '%s'",username)];
    select_query('userInterests','*',where_conditions)
        .then(function (result) {
            res.send(result);
        })
        .catch(function (error) {
            res.send(error);
        })
});

// app.get('/retrievalQuestions', function (req, res) {
//     select_query('retrievalQuestions','*')
//         .then(function (result) {
//             res.send(result);
//         })
//         .catch(function (error) {
//             res.send(error);
//         })
// });

// app.get('/users', function (req, res) {
//     select_query('users','*')
//         .then(function (result) {
//             res.send(result);
//         })
//         .catch(function (error) {
//             res.send(error);
//         })
// });

//
//
//
//
// function getUsernameFromToken(req,res,next){
//     const token = req.header('x-auth-token');
//     if (!token) res.status(401).send("Access denied. No token provided.");
//     // verify token
//     try {
//         const decoded = jwt.verify(token, secret);
//         return (decoded.name);
//         req.username = userId;
//         req.decoded = decoded;
//         next();
//         return userId;
//     } catch (exception) {
//         res.status(400).send("Invalid token.");
//     }
//     return true;
// }
// app.get('/get_POIIDs_ByCategory',function (req,res) {
//     var categoryName = req.body['category'];
//     select_query('POI','*',[util.format('Category_name=\'%s\'', categoryName)])
//         .then(function (result) {
//             var pois = [];
//             for (let i = 0; i < result.length; i++) {
//                 pois.push(result[i]['POI_ID']);
//             }
//             var json_to_send = {categoryPOIs:pois};
//             res.json(json_to_send);
//         })
//         .catch(function (err) {
//             console.log(err);
//             res.send(err);
//         })
// });

// app.get('/get_validation_questions', function(req, res){
//     select_query('ValidationQuestions','*')
//         .then(function (result) {
//             var questions = [];
//             for (let i = 0; i < result.length; i++) {
//                 questions.push(result[i]['que_description']);
//             }
//             var json_to_send = {questions:questions};
//             res.json(questions);
//         })
//         .catch(function (err) {
//             console.log(err);
//             res.send(err);
//         })
// });

// let sort_pois_by_avg_rating = () => {
//     return new Promise((resolve, reject) => {
//             var sorted_pois = [];
//             var get_sorted_poi_query = 'SELECT POI_ID\n' +
//                 'From reviews\n' +
//                 'Group by POI_ID\n' +
//                 'Order by -AVG(cast(rating as decimal))';
//             DButilsAzure.execQuery(get_sorted_poi_query)
//                 .then(function (result) {
//                     for (let i = 0; i < result.length; i++) {
//                         sorted_pois.push(result[i]['POI_ID']);
//                     }
//                     resolve(sorted_pois)
//                 })
//                 .catch(function (err) {
//                     reject(err);
//                 })
//         }
//     )
// };

// app.post('/get_user_details',function (req,res) {
//     var username = req.body['username'];
//     select_query('users','*',[util.format("User_name=\'%s\'",username)])
//         .then(function (result) {
//             var json_to_send = {
//                 // firstname:result[0]['First_name'],
//                 // lastname:result[0]['Last_name'],
//                 // city:result[0]['City'],
//                 // country:result[0]['Country'],
//                 // email:result[0]['Email'],
//                 // username:username,
//                 password:result[0]['Password']
//             };
//             res.json(json_to_send);
//         })
//         .catch(function (err) {
//             res.send(err);
//         })
// });
