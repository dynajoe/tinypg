# 3.0.0

* Move node-postgres to peer dependency. Hopefully, this allows consumers to address security issues in the module quicker and have control over it default configuration.

* Upgrade node-engine to latest

* Stop capturing stack trace for every database invocation. Doing this was a major performance penalty. Now when errors are thrown the query name and contents are added to the `TinyPgError` stack.

* Improve exposed types across the board

* Add pool configuration to options

* Add TLS configuration to options

* Use `debug` module. Add environment variable `DEBUG=tinypg:*` to see debug output. See https://www.npmjs.com/package/debug

* Expose postgres pool as a property on new TinyPg instance.

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