[![GitHub tag](https://img.shields.io/github/tag/joeandaverde/tinypg.svg?style=flat)](https://github.com/joeandaverde/tinypg/releases)
[![Actions Status](https://github.com/joeandaverde/tinypg/workflows/Test/badge.svg)](https://github.com/joeandaverde/tinypg/actions)

# Quick Start
```sh
npm i tinypg
```

```typescript
import { TinyPg } from 'tinypg'

// Options default to PG environment variables
const db = new TinyPg()

const result = await db.query(`SELECT 'Hello, World'`)

console.log(result)
// Prints:
// { row_count: 1,
//  rows: [ { '?column?': 'Hello, World' } ],
//  command: 'SELECT' }
```

# Introduction

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

## SQL files over embedded strings
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

TinyPg checks for the existence of required parameters when each query is executed. Instead of placing db null in it will fail with an error message describing the missing parameter. I highly recommend using an object literal to specify parameter in order to use some of the static analysis tools like tslint or the VS Code plugin.

## Transaction support

If you've ever looked at handling transactions with node-postgres you'll quickly realize that it's easy to get into deadlock. Tiny handles the re-use of the same connection for all queries performed within the same transaction provided you use the new database object provided by the call to *.transaction*. Here's how to create a customer and associate an address in the same transaction.

```typescript
db.transaction(async transaction_db => { // BEGIN
   const create_result = await transaction_db.sql('customer.create', { // INSERT
      first_name: 'Joe',
      last_name: 'Andaverde',
   })

   const customer = create_result.rows[0]

   await transaction_db.sql('address.create', { // INSERT
      customer_id: customer.customer_id,
      street: '123 W SomeStreet',
      city: 'SomeCity',
      state: 'SomeState',
      zip: 12345,
   })

   return customer.customer_id
}) // COMMIT
.then(async customer_id => {
   const fetch_result = await db.sql('customer.fetch', { // SELECT
      customer_id: customer_id,
   })

   return fetch_result.rows[0]
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

## Hooks
Hooks enable user defined functions to be called before (or after depending on the hook) TinyPg functions are executed. Most hooks allow user defined context to be passed throughout the hook lifecycle. Different hooks defined in the same `TinyHooks` object maintain a shared context across each hook call. The following hooks are currently supported:
* `preSql`
    - Called at the start of `TinyPg.sql` before the db call is performed.
    - `(tiny_ctx: TinyCallContext, name: string, params: TinyPgParams) => HookResult<[string, TinyPgParams]>`
    - Context for the given `HookSet` is set to the `ctx` field of the object returned
* `preRawQuery`
    - Called at the start of `TinyPg.query` before the db call is performed.
    - `(tiny_ctx: TinyCallContext, query: string, params: TinyPgParams) => HookResult<[string, TinyPgParams]>`
    - Context for the given `HookSet` is set to the `ctx` field of the object returned
* `onQuery`
    - Called when the `Pg.PoolClient` is obtained (start of db call). The *query* event is also emitted at this point.
    - `(ctx: any, query_begin_context: QueryBeginContext) => any`
    - Context for the given `HookSet` is set to the return value
* `onSubmit`
    - Called when the query is [submitted]. The *submit* event is emitted at this point. See [Pg Query](https://node-postgres.com/api/client#-code-client-query-config-queryconfig-gt-promise-lt-result-gt-code-).
    - `(ctx: any, query_submit_context: QuerySubmitContext) => any`
    - Context for the given `HookSet` is set to the return value
* `onResult`
    - Called when the query promise is resolved or rejected. The *result* event is emitted at this point.
    - `(ctx: any, query_complete_context: QueryCompleteContext) => any`
    - Context for the given `HookSet` is set to the return value
* `preTransaction`
    - Called at the start of `TinyPg.transaction`.
    - `(transaction_id: string) => any`
    - Transaction context for the given `HookSet` is set to the return value
* `onBegin`
    - Called immediately after the `BEGIN` promise is resolved to begin the transaction.
    - `(transaction_ctx: any, transaction_id: string) => any`
    - Transaction context for the given `HookSet` is set to the return value
* `onCommit`
    - Called immediately after the `COMMIT` promise is resolved to commit the transaction.
    - `(transaction_ctx: any, transaction_id: string) => any`
    - Transaction context for the given `HookSet` is set to the return value
* `onRollback`
    - Called immediately after the `ROLLBACK` promise is resolved to abort the transaction.
    - `(transaction_ctx: any, transaction_id: string, error: Error) => any`
    - Transaction context for the given `HookSet` is set to the return value

Note: a `HookResult` follows the form:
```
interface HookResult<T> {
   args: T
   ctx: any
}
```

There is only one rule about using hooks: **HOOKS MUST BE SYNCHRONOUS**

Hooks can be created via the `hooks` field on the `TinyPgOptions` passed to the constructor OR by calling `withHooks(hooks: TinyHooks)` on an instance of `TinyPg`. An example `TinyHooks` object can be found below. Notice how well hooks play with tracing tools such as [StackDriver trace](https://github.com/googleapis/cloud-trace-nodejs).
```typescript
{
    preSql: (tiny_context, file_name, params) => {
        const tracer = TraceAgent.get()

        const span = tracer.createChildSpan({
            name: `${file_name}_sql`,
        })

        _.forEach(buildSqlLabels(tiny_context, params), label => {
            span.addLabel(label.label_key, label.label_value)
        })

        return {
            ctx: {
                sql_span: span,
            },
            args: [file_name, params],
        }
    },
    onResult: (ctx: { sql_span: TraceAgent.PluginTypes.Span }, query_complete_context) => {
        const tracer = TraceAgent.get()

        if (tracer.isRealSpan(ctx.sql_span)) {
            _.forEach(buildResultLabels(query_complete_context), label => {
                ctx.sql_span.addLabel(label.label_key, label.label_value)
            })

            ctx.sql_span.endSpan()
        }

        return ctx
    },
    preTransaction: transaction_id => {
        const tracer = TraceAgent.get()

        const span = tracer.createChildSpan({
            name: 'tinypg_transaction',
        })

        span.addLabel('transaction_id', transaction_id)

        return {
            transaction_span: span,
        }
    },
    onCommit: (transaction_ctx: { transaction_span: TraceAgent.PluginTypes.Span }, _transaction_id) => {
        const tracer = TraceAgent.get()

        if (tracer.isRealSpan(transaction_ctx.transaction_span)) {
            transaction_ctx.transaction_span.endSpan()
        }

        return transaction_ctx
    },
    onRollback: (transaction_ctx: { transaction_span: TraceAgent.PluginTypes.Span }, _transaction_id, error) => {
        const tracer = TraceAgent.get()

        if (tracer.isRealSpan(transaction_ctx.transaction_span)) {
            transaction_ctx.transaction_span.addLabel('error', error)

            transaction_ctx.transaction_span.endSpan()
        }

        return transaction_ctx
    },
}
```

## VS Code Plugin Support

If you're using TypeScript in your project (which I highly recommend) you can get an extra level of validation and editor integration by using the TinyPg VS Code plugin. This plugin can statically analyze (why I suggest using object literals) your code to ensure you've referenced sql files that exist and have provided all required parameters.

[See Example Project on Github](https://github.com/joeandaverde/tinypg-example)

[TinyPg VS Code Plugin](https://github.com/joeandaverde/vscode-tinypg)

[TSLint Rules](https://github.com/smerchek/tslint-tinypg)

# API

## constructor(options: Partial<T.TinyPgOptions>)

- __root_dir: string[]__ - a list of directories. All directories must be specified using the full path.
- __connection_string: string__ - The database connection string in URL format. e.g. postgres://user:password@host:port/database?options=query
- __error_transformer: Function__ - Allows transforming all errors from TinyPg to your domain.
- __capture_stack_trace: boolean__ - Opt-in to capturing stack trace to give a better indication of what function in your domain caused an error.
- __tls_options__ - TLS options passed to the underlying socket.
- __pool_options__: (See [node-pg-pool](https://github.com/brianc/node-pg-pool) - only difference is casing)
- __hooks: TinyHooks__ - TinyHooks object see [Hooks](#hooks) for details about hooks.

### Example error_transformer

```typescript
const error_transformer = (error) => {
   const parseErrorByCode = () => {
      const pg_error = error.queryContext.error
      const code = pg_error.code

      switch (code) {
         case '22P02': // Invalid text representation
            return new E.InvalidArgumentError(error.message)
         case '23502': // Constraint error
            return new E.InvalidArgumentError(`Invalid Argument: ${pg_error.column}`)
         case '23503': // Foreign key violation
            return new E.ForeignKeyViolationError('Foreign Key Violation', pg_error)
         case '23505': // unique violation
         case '23P01': // exclusion constraint violation
            return new E.ConflictError('Data Conflict Error', pg_error)
         case '23514': // Check Violation
            return new E.InvalidArgumentError(`Invalid Argument: ${error.message}`)
         default:
            return new E.UnknownPostgresError(error.message)
      }
   }

   let new_error
   if (error.queryContext && error.queryContext.error && error.queryContext.error.code) {
      new_error = parseErrorByCode()
   } else {
      new_error = new E.UnknownPostgresError(error.message)
   }
   new_error.stack = error.stack
   return new_error
}
```

See [Pg Error Codes Documentation](https://www.postgresql.org/docs/9.6/static/errcodes-appendix.html)

## query<TResult,TParams>(raw_sql: string, params?: Object): Promise<T.Result<T>>

- __raw_sql: string__ - The SQL query to execute.
- __params: Object__ (optional) - parameters for the query.

## sql<TResult,TParams>(name: string, params?: Object): Promise<T.Result<T>>

- __name: string__ - The key of the sql file. This is the path to the file substituting `.` for path delimiter. e.g. `users.create`

## formattable(name: string): T.FormattableDbCall

Select a SQL file that has formattable parts. See [node-pg-format](https://github.com/datalanche/node-pg-format) for format strings. This is useful when needing to build dynamic queries.

- __name: string__ - The key of the sql file. This is the path to the file substituting `.` for path delimiter. e.g. `users.create`

### formattable example usage

database/users/retrieve.sql
```sql
SELECT *
FROM users
WHERE last_name = :last_name
ORDER BY
  -- Custom ordering
  %s

  user_id DESC;
```

Usage in code

```
db.formattable('users.retrieve')
  .format('last_name ASC,')
  .query({ last_name: 'Andaverde' })
```

Resulting Query

```sql
SELECT *
FROM users
WHERE last_name = :last_name
ORDER BY
  -- Custom ordering
  last_name ASC,

  user_id DESC;
```

## transaction<T = any>(tx_fn: (db: TinyPg) => Promise<T>): Promise<T>

Starts a database transaction and ensures all queries executed against the provided TinyPg instance use the same client.

- __tx_fn: (db: TinyPg) => Promise<T>__ - Provides db to perform transacted queries.

## withHooks(hooks: T.TinyHooks): TinyPg

Returns a new instance of TinyPg with the given `TinyHooks` added to the end of the instance's hook collection. See [Hooks](#hooks) for more details about each hook.

```
interface TinyHooks {
   preSql?: (tiny_ctx: TinyCallContext, name: string, params: TinyPgParams) => HookResult<[string, TinyPgParams]>
   preRawQuery?: (tiny_ctx: TinyCallContext, query: string, params: TinyPgParams) => HookResult<[string, TinyPgParams]>
   onQuery?: (ctx: any, query_begin_context: QueryBeginContext) => any
   onSubmit?: (ctx: any, query_submit_context: QuerySubmitContext) => any
   onResult?: (ctx: any, query_complete_context: QueryCompleteContext) => any
   preTransaction?: (transaction_id: string) => any
   onBegin?: (transaction_ctx: any, transaction_id: string) => any
   onCommit?: (transaction_ctx: any, transaction_id: string) => any
   onRollback?: (transaction_ctx: any, transaction_id: string, error: Error) => any
}
```

## isolatedEmitter(): T.Disposable & TinyPg

Provides an isolated event emitter so that `query`, `submit`, and `result` events (in that order) can be monitored for all queries related to the new TinyPg instance.

## close(): Promise<void>

Shuts down the postgres client pool.

# Development

You should have a local development Postgres server running. This server must allow connections from the `postgres` user without password. If this isn't the behavior your want change the connection string in `src/test/helper.ts`.

```bash
npm install
npm test
```
