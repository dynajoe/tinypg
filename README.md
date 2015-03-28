# TinyPg

I liked [MassiveJS](https://github.com/robconery/massive-js) but wanted less. This module allows for one to load SQL files from disk and execute using [node-postgres](https://github.com/brianc/node-postgres). It also allows for specifying arguments to SQL files using property names.

## Disclaimer
I created this project to use for my special case. It probably won't work for yours. It also is not very resilient to malformed SQL or variable names that don't match a very simple regex. I don't recommend using this module.

## Usage

```javascript
// assumes file system
// ./sql_files
//     fetch_user_by_name.sql
//     subdir_name/
//         fetch_foo.sql
var Tiny = require('tinypg');

var t = new Tiny({
   connection_string: "postgres://joe@localhost:5432/mydb",
   root_dir: './sql_files',
   snake: true // camel: true is default
});

// Example 1
t.sql.fetch_user_by_name({ name: 'Joe' })
.then(function () { })
.fail(function () { });

// Example of file in a sub directory
t.sql.subdir_name.fetch_foo({ a: 1, b: 2, c: 'foo' })
.then(function () { })
.fail(function () { });
```

fetch_user_by_email.sql
```sql
SELECT * FROM user WHERE name = :name;
```

subdir_name/fetch_foo.sql
```sql
SELECT *
FROM foo
   INNER JOIN bar ON foo.bar_id = bar.id
WHERE bar.a = :a
   AND foo.b = :b
   AND foo.something = :c;
```
This example requires that there be a folder relative to the current file called sql_files with a file named `fetch_user_by_email.sql`. Subdirectories are represented as nested objects on the `sql` root object.