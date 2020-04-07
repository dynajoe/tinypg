import * as _ from 'lodash'
import * as T from './types'
import * as Pg from 'pg'
import * as P from './parser'
import * as Util from './util'
import { EventEmitter } from 'events'
import * as Url from 'url'
import * as E from './errors'
import { parseSql } from 'tinypg-parser'
import { createHash } from 'crypto'
import { TlsOptions } from 'tls'

const Uuid = require('node-uuid')
const PgFormat = require('pg-format')

const Debug = require('debug')

const log = Debug('tinypg')

const parseConnectionConfigFromUrlOrDefault = (connection_string?: string, tls_options?: TlsOptions): Pg.PoolConfig => {
   const default_user = _.isNil(process.env.PGUSER) ? 'postgres' : process.env.PGUSER
   const default_password = _.isNil(process.env.PGPASSWORD) ? undefined : process.env.PGPASSWORD
   const default_host = _.isNil(process.env.PGHOST) ? 'localhost' : process.env.PGHOST
   const default_database = _.isNil(process.env.PGDATABASE) ? 'postgres' : process.env.PGDATABASE
   const default_port = _.isNil(process.env.PGPORT) ? 5432 : _.toInteger(process.env.PGPORT)
   const default_ssl = _.isNil(process.env.PGSSLMODE) ? 'disable' : process.env.PGSSLMODE

   const params = Url.parse(_.isNil(connection_string) ? '' : connection_string, true)
   const [user, password] = _.isNil(params.auth) ? [default_user, default_password] : params.auth.split(':', 2)

   const port = _.toInteger(_.defaultTo(params.port, default_port))
   const database = _.isNil(params.pathname) ? default_database : params.pathname.split('/')[1]
   const enable_ssl = !_.includes(['disable', 'allow'], _.get(params.query, 'sslmode', default_ssl))
   const host = _.defaultTo(params.hostname, default_host)

   return {
      user: user,
      password: password,
      host: host,
      port: port,
      database: database,
      ssl: enable_ssl ? _.defaultTo(tls_options, true) : false,
   }
}

export class TinyPg {
   public events: T.TinyPgEvents
   public pool: Pg.Pool
   public sql_db_calls: { [key: string]: DbCall }

   private hooks: T.TinyHooks[]
   private error_transformer: E.TinyPgErrorTransformer
   private sql_files: T.SqlFile[]
   private options: T.TinyPgOptions
   private transaction_id?: string

   constructor(options: T.TinyPgOptions) {
      options = _.isNil(options) ? {} : options

      this.events = new EventEmitter()
      this.error_transformer = _.isFunction(options.error_transformer) ? options.error_transformer : _.identity
      this.options = options
      this.hooks = _.isNil(this.options.hooks) ? [] : [this.options.hooks]

      const pool_options = _.isNil(options.pool_options) ? {} : options.pool_options

      const config_from_url = parseConnectionConfigFromUrlOrDefault(options.connection_string, options.tls_options)

      const pool_config: Pg.PoolConfig & { log: any } = {
         ...config_from_url,
         keepAlive: pool_options.keep_alive,
         connectionTimeoutMillis: pool_options.connection_timeout_ms,
         idleTimeoutMillis: pool_options.idle_timeout_ms,
         application_name: pool_options.application_name,
         statement_timeout: pool_options.statement_timeout_ms,
         max: pool_options.max,
         min: pool_options.min,
         log: Debug('tinypg:pool'),
      }

      this.pool = new Pg.Pool(pool_config)

      this.pool.on('error', error => {
         log('Error with idle client in pool.', error)
      })

      this.sql_files = P.parseFiles(_.compact(_.castArray(options.root_dir)))

      const db_calls = _.map(this.sql_files, sql_file => {
         return new DbCall({
            name: sql_file.name,
            key: sql_file.key,
            text: sql_file.text,
            parameterized_query: sql_file.parsed.parameterized_sql,
            parameter_map: sql_file.parsed.mapping,
            prepared: _.defaultTo(options.use_prepared_statements, false),
         })
      })

      this.sql_db_calls = _.keyBy(db_calls, x => x.config.key!)
   }

   query<T extends object = any, P extends T.TinyPgParams = T.TinyPgParams>(raw_sql: string, params?: P): Promise<T.Result<T>> {
      const query_id = Uuid.v4()

      const hook_lifecycle = this.makeHooksLifeCycle()

      const [new_query, new_params] = hook_lifecycle.preRawQuery({ query_id: query_id, transaction_id: this.transaction_id }, [raw_sql, params]).args

      return Util.stackTraceAccessor(this.options.capture_stack_trace!, async () => {
         const parsed = parseSql(raw_sql)

         const db_call = new DbCall({
            name: 'raw_query',
            key: createHash('md5').update(parsed.parameterized_sql).digest('hex'),
            text: new_query,
            parameterized_query: parsed.parameterized_sql,
            parameter_map: parsed.mapping,
            prepared: false,
         })

         return await this.performDbCall(db_call, hook_lifecycle, new_params, query_id)
      })
   }

   sql<T extends object = any, P extends T.TinyPgParams = T.TinyPgParams>(name: string, params?: P): Promise<T.Result<T>> {
      const query_id = Uuid.v4()

      const hook_lifecycle = this.makeHooksLifeCycle()

      const [, new_params] = hook_lifecycle.preSql({ query_id: query_id, transaction_id: this.transaction_id }, [name, params]).args

      return Util.stackTraceAccessor(this.options.capture_stack_trace!, async () => {
         log('sql', name)

         const db_call: DbCall = this.sql_db_calls[name]

         if (_.isNil(db_call)) {
            throw new Error(`Sql query with name [${name}] not found!`)
         }

         return this.performDbCall(db_call, hook_lifecycle, new_params, query_id)
      })
   }

   transaction<T = any>(tx_fn: (db: TinyPg) => Promise<T>): Promise<T> {
      const transaction_id = Uuid.v4()

      const hook_lifecycle = this.makeHooksLifeCycle()

      hook_lifecycle.preTransaction(transaction_id)

      return Util.stackTraceAccessor(this.options.capture_stack_trace!, async () => {
         log('transaction')

         const tx_client = await this.getClient()

         const release_ref = tx_client.release
         tx_client.release = () => {}

         const release = () => {
            log('RELEASE transaction client')
            tx_client.release = release_ref
            tx_client.release()
         }

         try {
            log('BEGIN transaction')

            await tx_client.query('BEGIN')

            hook_lifecycle.onBegin(transaction_id)

            const tiny_tx: TinyPg = Object.create(this)

            tiny_tx.transaction_id = transaction_id

            const assertThennable = (tx_fn_result: any) => {
               if (_.isNil(tx_fn_result) || !_.isFunction(tx_fn_result.then)) {
                  throw new Error('Expected thennable to be returned from transaction function.')
               }

               return tx_fn_result
            }

            tiny_tx.transaction = <T = any>(tx_fn: (db: TinyPg) => Promise<T>): Promise<T> => {
               log('inner transaction')
               return assertThennable(tx_fn(tiny_tx))
            }

            tiny_tx.getClient = async () => {
               log('getClient (transaction)')
               return tx_client
            }

            const result = await assertThennable(tx_fn(tiny_tx))

            log('COMMIT transaction')

            await tx_client.query('COMMIT')

            hook_lifecycle.onCommit(transaction_id)

            return result
         } catch (error) {
            log('ROLLBACK transaction')

            await tx_client.query('ROLLBACK')

            hook_lifecycle.onRollback(transaction_id, error)

            throw error
         } finally {
            release()
         }
      })
   }

   withHooks(hooks: T.TinyHooks): TinyPg {
      const new_tiny = Object.create(this) as TinyPg

      new_tiny.hooks = [...new_tiny.hooks, hooks]

      return new_tiny
   }

   makeHooksLifeCycle(): Required<T.TinyHookLifecycle> {
      const hooks_to_run: T.HookSetWithContext[] = this.hooks.map(hook_set => {
         return { ctx: null, transaction_ctx: null, hook_set: hook_set }
      })

      const preHook = (
         fn_name: 'preSql' | 'preRawQuery',
         ctx: T.TinyCallContext,
         args: [string, T.TinyPgParams]
      ): T.HookResult<[string, T.TinyPgParams]> => {
         return hooks_to_run.reduce(
            (last_result, hook_set_with_ctx) => {
               const hook_fn: any = hook_set_with_ctx.hook_set[fn_name]

               if (_.isNil(hook_fn) || !_.isFunction(hook_fn)) {
                  return last_result
               }

               const [name_or_query, params] = last_result.args

               const result = hook_fn(ctx, name_or_query, params)

               hook_set_with_ctx.ctx = result.ctx

               return result
            },
            { args: args, ctx: ctx }
         )
      }

      const dbCallHook = (
         fn_name: 'onSubmit' | 'onQuery' | 'onResult',
         query_context: T.QuerySubmitContext | T.QueryBeginContext | T.QueryCompleteContext
      ): void => {
         _.forEach(hooks_to_run, hook_set_with_ctx => {
            const hook_fn: any = hook_set_with_ctx.hook_set[fn_name]

            if (_.isNil(hook_fn) || !_.isFunction(hook_fn)) {
               return
            }

            try {
               hook_set_with_ctx.ctx = hook_fn(hook_set_with_ctx.ctx, <any>query_context)
            } catch (error) {
               log(`${fn_name} hook error`, error)
            }
         })
      }

      const transactionHook = (
         fn_name: 'preTransaction' | 'onBegin' | 'onCommit' | 'onRollback',
         transaction_id: string,
         transaction_error?: Error
      ) => {
         _.forEach(hooks_to_run, hook_set_with_ctx => {
            const hook_fn: any = hook_set_with_ctx.hook_set[fn_name]

            if (_.isNil(hook_fn) || !_.isFunction(hook_fn)) {
               return
            }

            try {
               hook_set_with_ctx.transaction_ctx =
                  fn_name === 'preTransaction'
                     ? hook_fn(transaction_id)
                     : hook_fn(hook_set_with_ctx.transaction_ctx, transaction_id, transaction_error)
            } catch (error) {
               log(`${fn_name} hook error`, error)
            }
         })
      }

      return {
         preSql: (ctx: T.TinyCallContext, args) => {
            return preHook('preSql', ctx, args)
         },
         preRawQuery: (ctx: T.TinyCallContext, args) => {
            return preHook('preRawQuery', ctx, args)
         },
         onSubmit: (query_submit_context: T.QuerySubmitContext) => {
            dbCallHook('onSubmit', query_submit_context)
         },
         onQuery: (query_begin_context: T.QueryBeginContext) => {
            dbCallHook('onQuery', query_begin_context)
         },
         onResult: (query_complete_context: T.QueryCompleteContext) => {
            dbCallHook('onResult', query_complete_context)
         },
         preTransaction: (transaction_id: string) => {
            transactionHook('preTransaction', transaction_id)
         },
         onBegin: (transaction_id: string) => {
            transactionHook('onBegin', transaction_id)
         },
         onCommit: (transaction_id: string) => {
            transactionHook('onCommit', transaction_id)
         },
         onRollback: (transaction_id: string, transaction_error: Error) => {
            transactionHook('onRollback', transaction_id, transaction_error)
         },
      }
   }

   formattable(name: string): FormattableDbCall {
      const db_call: DbCall = this.sql_db_calls[name]

      if (_.isNil(db_call)) {
         throw new Error(`Sql query with name [${name}] not found!`)
      }

      return new FormattableDbCall(db_call, this)
   }

   isolatedEmitter(): T.Disposable & TinyPg {
      const new_event_emitter = new EventEmitter()

      const tiny_overrides: Partial<TinyPg> = { events: new_event_emitter }

      return _.create(
         TinyPg.prototype,
         _.extend<T.Disposable>(
            {
               dispose: () => {
                  new_event_emitter.removeAllListeners()
               },
            },
            this,
            tiny_overrides
         )
      )
   }

   close(): Promise<void> {
      return this.pool.end()
   }

   getClient(): Promise<Pg.PoolClient> {
      log(`getClient [total=${this.pool.totalCount},waiting=${this.pool.waitingCount},idle=${this.pool.idleCount}]`)
      return this.pool.connect()
   }

   async performDbCall<T extends object = any, P extends T.TinyPgParams = T.TinyPgParams>(
      db_call: DbCall,
      hooks: Required<T.TinyHookLifecycle>,
      params?: P,
      query_id?: string
   ): Promise<T.Result<T>> {
      log('performDbCall', db_call.config.name)

      let call_completed = false
      let client: Pg.PoolClient

      const start_at = Date.now()

      const begin_context: T.QueryBeginContext = {
         id: _.isNil(query_id) ? Uuid.v4() : query_id,
         sql: db_call.config.parameterized_query,
         start: start_at,
         name: db_call.config.name,
         params: params,
      }

      let submit_context: T.QuerySubmitContext | null = null

      // Work around node-postgres swallowing queries after a connection error
      // https://github.com/brianc/node-postgres/issues/718
      const connection_failed_promise = new Promise<any>((resolve, reject) => {
         const checkForConnection = () => {
            if (call_completed) {
               resolve()
            } else if (_.get(client, 'connection.stream.destroyed', false)) {
               reject(new Error('Connection terminated'))
            } else {
               setTimeout(checkForConnection, 500)
            }
         }

         setTimeout(checkForConnection, 500)
      })

      const query_promise = async (): Promise<T.Result<T>> => {
         client = await this.getClient()
         let error: any = null

         try {
            hooks.onQuery(begin_context)

            this.events.emit('query', begin_context)

            log('executing', db_call.config.name)

            const values: any[] = _.map(db_call.config.parameter_map, m => {
               if (!_.has(params, m.name)) {
                  throw new Error(`Missing expected key [${m.name}] on input parameters.`)
               }

               return _.get(params, m.name)
            })

            const query: T.TinyQuery = db_call.config.prepared
               ? new Pg.Query({
                    name: db_call.prepared_name,
                    text: db_call.config.parameterized_query,
                    values: values,
                 })
               : new Pg.Query(db_call.config.parameterized_query, values)

            const original_submit = query.submit

            query.submit = (connection: any) => {
               const submitted_at = Date.now()
               submit_context = { ...begin_context, submit: submitted_at, wait_duration: submitted_at - begin_context.start }

               hooks.onSubmit(submit_context)

               this.events.emit('submit', submit_context)
               original_submit.call(query, connection)
            }

            const result = await new Promise<Pg.QueryResult>((resolve, reject) => {
               query.callback = (err: any, res: any) => (err ? reject(err) : resolve(res))
               client.query(query)
            })

            log('execute result', db_call.config.name)

            return { row_count: result.rowCount, rows: result.rows, command: result.command }
         } catch (e) {
            error = e
            throw e
         } finally {
            if (!_.isNil(error) && (!error['code'] || _.startsWith(error['code'], '57P'))) {
               client.release(error)
            } else {
               client.release()
            }
         }
      }

      const createCompleteContext = (error: any, data: T.Result<T> | null): T.QueryCompleteContext => {
         const end_at = Date.now()
         const query_duration = end_at - start_at

         const submit_timings = _.isNil(submit_context)
            ? {
                 submit: undefined,
                 wait_duration: query_duration,
                 active_duration: 0,
              }
            : {
                 submit: submit_context.submit,
                 wait_duration: submit_context.wait_duration,
                 active_duration: end_at - submit_context.submit,
              }

         return {
            ...begin_context,
            ...submit_timings,
            end: end_at,
            duration: query_duration,
            error: error,
            data: data,
         }
      }

      const emitQueryComplete = (complete_context: T.QueryCompleteContext) => {
         hooks.onResult(complete_context)
         this.events.emit('result', complete_context)
      }

      try {
         const data = await Promise.race([connection_failed_promise, query_promise()])

         emitQueryComplete(createCompleteContext(null, data))

         return data
      } catch (e) {
         const tiny_stack = `[${db_call.config.name}]\n\n${db_call.config.text}\n\n${e.stack}`
         const complete_context = createCompleteContext(e, null)

         emitQueryComplete(complete_context)

         const tiny_error = new E.TinyPgError(`${e.message}`, tiny_stack, complete_context)

         throw this.error_transformer(tiny_error)
      } finally {
         call_completed = true
      }
   }
}

export class DbCall {
   config: T.DbCallConfig
   prepared_name?: string

   constructor(config: T.DbCallConfig) {
      this.config = config

      if (this.config.prepared) {
         const hash_code = Util.hashCode(config.parameterized_query).toString().replace('-', 'n')
         this.prepared_name = `${config.name}_${hash_code}`.substring(0, 63)
      }
   }
}

export class FormattableDbCall {
   private db: TinyPg
   private db_call: DbCall

   constructor(db_call: DbCall, tiny: TinyPg) {
      this.db = tiny
      this.db_call = db_call
   }

   format(...args: any[]): FormattableDbCall {
      const formatted_sql = PgFormat(this.db_call.config.text, ...args)
      const parsed = parseSql(formatted_sql)

      const new_db_call = new DbCall({
         ...this.db_call.config,
         text: formatted_sql,
         parameterized_query: parsed.parameterized_sql,
         parameter_map: parsed.mapping,
      })

      return new FormattableDbCall(new_db_call, this.db)
   }

   query<T extends object = any, P extends T.TinyPgParams = T.TinyPgParams>(params?: P): Promise<T.Result<T>> {
      const hook_lifecycle = this.db.makeHooksLifeCycle()

      return this.db.performDbCall(this.db_call, hook_lifecycle, params)
   }
}
