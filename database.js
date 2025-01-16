var mysql = require("mysql2");

var connection = mysql.createConnection({
    host: 'localhost',
    database: 'biotech',
    user: 'root',
    password: 'Teste123'
});

module.exports = connection;