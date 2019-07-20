const DButilsAzure = require('./DButils');
var select_query = require('./queries')


function get_categories (req, res){
    select_query.select_query('Categories','*')
        .then(function (result) {
            var categories = [];
            for (let i = 0; i < result.length; i++) {
                categories.push(result[i]['Category_name']);
            }
            var json_to_send = {categories:categories};
            res.json(json_to_send);
        })
        .catch(function (err) {
            console.log(err);
            res.send(err);
        })
}




exports.get_categories = get_categories;