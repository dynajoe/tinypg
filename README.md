## Introduction

TinyPg makes it possible to use objects as the source for parameters in a query. For example:

```typescript
db.query(`
SELECT * 
FROM customer
   INNER JOIN address ON address.customer_id = customer.customer_id
WHERE address.state = :state
   AND customer.first_name = :first_name
   AND customer.last_name = :last_name;
`, {
   first_name: 'Joe',
   last_name: 'Andaverde',
   state: 'Kansas', 
})
```

### SQL files over embedded strings
Now that we're past the mess of managing parameters the next step is organizing our SQL statements. It's kind of ugly to embed SQL in your JavaScript syntax. TinyPg allows for specifying a directory for which it will load all files with the `.sql` extension. The path to the file will normalized into a key for which you can look up and execute the SQL in the file as a prepared statement. For our projects we have hundreds of different SQL queries. It's worth noting that we don't subscribe to tools that generate SQL on your behalf. Many of our queries require use of Postgres features that no SQL generator can provide. Therefore, we don't bother trying to force these libraries to be smarter and stick to the language that's best suited for retrieving data from relational data stores: SQL. 

Consider the following directory structure:

```
/app
   /db
      /address
         create.sql
      /customer
         create.sql
         fetch.sql
         search.sql
```

If you provide */app/db* as a root directory to TinyPg it will load and parse parameters from all sql files beneath that directory. These files are keyed using the path to the file e.g. *address.create* or *customer.fetch*. Here's an example usage:

```typescript
db.sql('customer.search', {
   first_name: 'Joe',
   last_name: 'Andaverde',
   state: 'Kansas',
}) 
```

TinyPg checks for the existence of required parameters when each query is executed. Instead of placing db null in will fail with an error message describing the missing parameter. I highly recommend using an object literal to specify parameter in order to use some of the static analysis tools like tslint or the VS Code plugin.

### Transaction support

If you've ever looked at handling transactions with node-postgres you'll quickly realize that it's easy to get into deadlock. Tiny handles the re-use of the same connection for all queries performed within the same transaction provided you use the new database object provided by the call to *.transaction*. Here's how to create a customer and associate an address in the same transaction.

```typescript

db.transaction(transaction_db => { // BEGIN
   return transaction_db.sql('customer.create', { // INSERT
      first_name: 'Joe',
      last_name: 'Andaverde',
   })
   .then(result => {
      const customer = result.rows[0]

      return transaction_db.sql('address.create', { // INSERT
         customer_id: customer.customer_id,
         street: '123 W 10th St',
         city: 'Shawnee',
         state: 'Kansas',
         zip: 66666,
      })
   .then(() => customer.customer_id)
   })
}) // COMMIT
.then(customer_id => {
   return db.sql('customer.fetch', { // SELECT
      customer_id: customer_id,
   })
   .then(result => result.rows[0])
})
```

Whenever your promise succeeds it'll automatically execute *COMMIT* and in the event of failure it will execute *ROLLBACK*. Calling *transaction* on a Tiny instance that's already in a transaction will be a no-op. It is important that the lambda given to the transaction function return a promise. Otherwise *COMMIT* may be called at an unexpected time. Synchronous errors thrown in a transaction lambda will be caught and result in a *ROLLBACK*.

Here's the sequence of SQL statements that would be executed:

```sql
BEGIN
INSERT INTO customer ...
INSERT INTO address ...
COMMIT
SELECT * FROM customer ...
```

Notice the select AFTER the transaction has been committed. This is very important in order to return data that's actually persisted in the database.

## Events
Events are emitted for the beginning and end of a query. This has been helpful for us to diagnose slow running queries. Our practice is to create a single instance of TinyPg per process and attach handlers to the *query* and *result* events to log all database queries.

Sometimes you need to associate several database calls with some context e.g., a web request. TinyPg provides a way to create a brand new event emitter that can emit events separately from the global handlers. This functionality isn't thoroughly flushed out and may not fit all use cases but works great for us thus far. Here's an example:

```typescript
const db = new TinyPg(options)

function ApiRequestHandler(request, reply) {
   const isolated_db = db.isolatedEmitter()

   isolated_db.events.on('query', context => {
      console.log(request.request_id, context.name)
   })

   return new UserService(isolated_db).list()
   .then(users => reply(users))
}
```

In the above example *isolated_db* is the same instance of TinyPg except with an overridden events property and *dispose* method to remove all listeners. The *UserService* can create other services and pass its reference to *isolated_db* to other services. In doing so, you can track all database queries executed as the result of every API request.

### VS Code Plugin Support

If you're using TypeScript in your project (which I highly recommend) you can get an extra level of validation and editor integration by using the TinyPg VS Code plugin. This plugin can statically analyze (why I suggest using object literals) your code to ensure you've referenced sql files that exist and have provided all required parameters.

[See Example Project on Github](https://github.com/joeandaverde/tinypg-example)

[TinyPg VS Code Plugin](https://github.com/joeandaverde/vscode-tinypg)

[TSLint Rules](https://github.com/smerchek/tslint-tinypg)
