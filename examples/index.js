var Tiny = require('../');

var t = new Tiny({
   connection_string: "postgres://joe@localhost:5432/mydb",
   root_dir: './sql_files',
   snake: true
});

t.sql.fetch_user_by_name({ name: 'Joe' })
.then(function () { })
.fail(function () { });