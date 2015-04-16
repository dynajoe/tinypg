var Tiny = require('../');

var t = new Tiny({
   connection_string: "postgres://joe@localhost:5432/mydb",
   root_dir: __dirname + '/sql_files',
   snake: true
});

Tiny.pgDefaults({
   poolSize: 1
});

t.sql.fetch_user_by_name({ name: 'Joe' })
.then(function () { })
.catch(function () { });

t.query('SELECT * FROM users where name = :name', {
   name: 'Joe'
})
.then(function () { })
.catch(function () { });

t.getClient().then(function (ctx) {
   console.log('Closing connection');
   ctx.client.end();
});