var mysql = require("mysql2");

var connection = mysql.createConnection({
    host: 'localhost',
    database: 'biotech',
    user: 'root',
    password: 'XXXXX'
});

module.exports = connection;