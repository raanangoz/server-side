const DButilsAzure = require('./DButils');

var util = require('util');
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



exports.select_query = select_query;