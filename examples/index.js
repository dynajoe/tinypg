const TinyPg = require('../').TinyPg

const db = new TinyPg({
   connection_string: 'postgres://postgres@localhost:5432/mydb',
   root_dir: __dirname + '/sql_files'
})

db.sql('fetch_user_by_name', {
   name: 'Joe',
})
.then(res => {
   console.log(res)
})
.catch(error => {
   console.log(error)
})

db.query('SELECT * FROM users where name = :name', {
   name: 'Joe'
})
.then(res => {
   console.log(res)
})
.catch(error => {
   console.log(error)
})
