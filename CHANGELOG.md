# 5.1.0 - 2020-03-22

Update dev dependencies. Use new when constructing node pg Query type internally because of deprecation warning.

# 5.0.0 - 2019-09-17

Update to TypeScript 3.6.3. Public API's changed due to new typescript features for parameterized type defaults.

# 4.1.0

Added a new `submit` event to indicate when the postgres query is submitted to the server. This will help consumers capture the actual duration of the  queries excluding the client pool wait time.

# 4.0.0

By default, sql files will **no longer be prepared statements**. To enable this feature set the option `use_prepared_statements` to `true`.

The reasoning behind this change is to support connection pooling with a tool like [PgBouncer](https://github.com/pgbouncer/pgbouncer). Using PgBouncer results in a high possibility that a prepared statement will not be available to the executing session. See explanation [by depesz here](https://www.depesz.com/2012/12/02/what-is-the-point-of-bouncing/).

* Added `use_prepared_statements` : boolean

# 3.0.1

* More pool configuration options
   * Added `statement_timeout_ms` : number
   * Added `keep_alive` : boolean pg pool options

# 3.0.0

* Move node-postgres to peer dependency. Hopefully, this allows consumers to address security issues in the module quicker and have control over its default configuration.

* Upgrade node-engine to latest

* Stop capturing stack trace for every database invocation by default. Set `capture_stack_trace` option to true to get concatenated stack trace.

* When errors are thrown the query name and contents are added to the `TinyPgError` stack.

* Improve exposed types across the board

* Add pool configuration to options

* Add TLS configuration to options

* Use `debug` module. Add environment variable `DEBUG=tinypg:*` to see debug output. See https://www.npmjs.com/package/debug

* Expose postgres pool as a property on new TinyPg instance.

* Expose `getClient() : Promise<Pg.PoolClient>` to get a client from the pool. It's up to you to release it. This allow usage of the node postgres query interface directly. Calling this method on a `TinyPg` instance in a transaction will always return the same client.

* Better options parsing with sensible defaults.

* Refactor internals to use async/await.

# 2.0.1

* Bump patch version of pg to address security concern.

# 2.0.0

* Convert project to typescript.

* Lock down package versions by exact version.

* Expect callback passed to .transaction to return a `thennable`.

* SSL mode is enabled unless explicitly disabled using sslmode=disable.

* Work around node-postgres swallowing queries after a connection error https://github.com/brianc/node-postgres/issues/718

* Release pool client with error parameter if unexpected error occurs.

* Handle pool error event with log.

# 1.0.0

* Initial release