## Usage

```javascript
// assumes file system
// ./sql_files
//     fetch_user_by_name.sql
//     subdir_name/
//         fetch_foo.sql
const Tiny = require('tinypg')

const db = new Tiny({
   connection_string: 'postgres://postgres@localhost:5432/mydb',
   root_dir: './sql_files'
})

// Example 1
db.sql('fetch_user_by_name', { name: 'Joe' })
.then(() => { })
.catch(() => { })

// Example of file in a sub directory
db.sql('subdir_name.fetch_foo', { a: 1, b: 2, c: 'foo' })
.then(() => { })
.catch(() => { })
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
This example requires that there be a folder relative to the current file called sql_files with a file named `fetch_user_by_email.sql`.

### Transactions

The `.transaction` method provides a context that ensures every command executed against that
context will be run in the same transaction. Nested transactions are supported (which really just means
that COMMIT/ROLLBACK will be left up to the outermost transaction).

If you do not use the provided context, those queries cannot be guaranteed to use the same transaction.

```javascript
   const db = new Tiny({
      connection_string: 'postgres://postgres@localhost:5432/mydb',
      root_dir: './sql_files'
   })

   db.transaction((ctx) => {
      return ctx.query('INSERT INTO a (text) VALUES (:text)', {
         text: '1'
      })
      .then((res) => {
         return ctx.transaction((ctx2) => {
            return ctx2.query('INSERT INTO a (text) VALUES (:text)', {
               text: '2'
            })
         })
      })
   })
```
