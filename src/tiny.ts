import * as _ from 'lodash'
import * as T from './types'
import * as Pg from 'pg'
import * as P from './parser'
import * as Util from './util'
import { EventEmitter } from 'events'
import * as Url from 'url'
import * as E from './errors'

const Uuid = require('node-uuid')
const PgFormat = require('pg-format')

const Debug = require('debug')

const log = Debug('tinypg')

export class TinyPg {
   public events: T.TinyPgEvents
   public pool: Pg.Pool
   public sql_db_calls: { [key: string]: DbCall }

   private hooks: T.TinyHooks[]
   private error_transformer: E.TinyPgErrorTransformer
   private sql_files: T.SqlFile[]
   private options: T.TinyPgOptions

   constructor(options: T.TinyPgOptions) {
      this.events = new EventEmitter()
      this.error_transformer = _.isFunction(options.error_transformer) ? options.error_transformer : _.identity
      this.options = options
      this.hooks = _.isNil(this.options.hooks) ? [] : [this.options.hooks]

      const params = Url.parse(options.connection_string, true)
      const [user, password] = _.isNil(params.auth) ? ['postgres', undefined] : params.auth.split(':', 2)
      const pool_options = _.isNil(options.pool_options) ? {} : options.pool_options
      const port = _.isNil(params.port) ? 5432 : _.toInteger(params.port)
      const database = _.isNil(params.pathname) ? 'localhost' : params.pathname.split('/')[1]
      const enable_ssl = _.get(params.query, 'sslmode') !== 'disable'

      const pool_config: Pg.PoolConfig = {
         user: user,
         password: password,
         host: params.hostname,
         port: port,
         database: database,
         ssl: enable_ssl ? _.defaultTo(options.tls_options, true) : false,
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

      this.sql_db_calls = _.keyBy(
         _.map(this.sql_files, sql_file => {
            return new DbCall({
               name: sql_file.name,
               key: sql_file.key,
               text: sql_file.text,
               parameterized_query: sql_file.parsed.parameterized_sql,
               parameter_map: sql_file.parsed.mapping,
               prepared: _.defaultTo(options.use_prepared_statements, false),
            })
         }),
         x => x.config.key
      )
   }

   query<T extends object = any, P extends object = T.TinyPgParams>(raw_sql: string, params?: P): Promise<T.Result<T>> {
      const query_id = Uuid.v4()
      const hook_lifecycle = this.makeHooksLifeCycle()
      const [new_query, new_params] = hook_lifecycle.preRawQuery({ query_id: query_id }, [raw_sql, params]).args

      return Util.stackTraceAccessor(this.options.capture_stack_trace, async () => {
         const parsed = P.parseSql(raw_sql)

         const db_call = new DbCall({
            name: 'raw_query',
            key: null,
            text: new_query,
            parameterized_query: parsed.parameterized_sql,
            parameter_map: parsed.mapping,
            prepared: false,
         })

         return await this.performDbCall<T>(db_call, hook_lifecycle, new_params, query_id)
      })
   }

   sql<T extends object = any, P extends object = T.TinyPgParams>(name: string, params?: P): Promise<T.Result<T>> {
      const query_id = Uuid.v4()
      const hook_lifecycle = this.makeHooksLifeCycle()
      const [new_name, new_params] = hook_lifecycle.preSql({ query_id: query_id }, [name, params]).args

      // TODO: Handle caller_context for transactions calling this function
      // const preSqlResult = this.runPreSqlHooks(name, query_id, params, null)

      return Util.stackTraceAccessor(this.options.capture_stack_trace, async () => {
         log('sql', new_name)

         const db_call: DbCall = this.sql_db_calls[new_name]

         if (_.isNil(db_call)) {
            throw new Error(`Sql query with name [${new_name}] not found!`)
         }

         return this.performDbCall<T>(db_call, hook_lifecycle, new_params, query_id)
      })
   }

   transaction<T = any>(tx_fn: (db: TinyPg) => Promise<T>): Promise<T> {
      return Util.stackTraceAccessor(this.options.capture_stack_trace, async () => {
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

            const tiny_tx: TinyPg = Object.create(this)

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

            return result
         } catch (error) {
            log('ROLLBACK transaction')
            await tx_client.query('ROLLBACK')
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
      interface Stuff {
         ctx: any
         hook_set: T.TinyHooks
      }

      const hooks_to_run: Stuff[] = this.hooks.map(hook_set => {
         return { ctx: null, hook_set: hook_set }
      })

      return {
         preSql: (ctx: T.TinyCallContext, args) => {
            return hooks_to_run.reduce(
               (last_result, hook_set_with_ctx: Stuff) => {
                  if (_.isNil(hook_set_with_ctx.hook_set.preSql)) {
                     return last_result
                  }

                  const [name, params] = last_result.args
                  const result = hook_set_with_ctx.hook_set.preSql(ctx, name, params)
                  hook_set_with_ctx.ctx = result.ctx
                  return result
               },
               { args: args, ctx: ctx }
            )
         },
         preRawQuery: (ctx: T.TinyCallContext, args) => {
            return hooks_to_run.reduce(
               (last_result, hook_set_with_ctx: Stuff) => {
                  if (_.isNil(hook_set_with_ctx.hook_set.preRawQuery)) {
                     return last_result
                  }
                  const [raw_query, params] = last_result.args
                  const result = hook_set_with_ctx.hook_set.preRawQuery(ctx, raw_query, params)
                  hook_set_with_ctx.ctx = result.ctx
                  return result
               },
               { args: args, ctx: ctx }
            )
         },
         onSubmit: (query_submit_context: T.QuerySubmitContext) => {
            _.forEach(hooks_to_run, hook_set_with_ctx => {
               if (_.isNil(hook_set_with_ctx.hook_set.onSubmit)) {
                  return
               }
               hook_set_with_ctx.ctx = hook_set_with_ctx.hook_set.onSubmit(hook_set_with_ctx.ctx, query_submit_context)
            })
         },
         onQuery: (query_begin_context: T.QueryBeginContext) => {
            _.forEach(hooks_to_run, hook_set_with_ctx => {
               if (_.isNil(hook_set_with_ctx.hook_set.onQuery)) {
                  return
               }
               hook_set_with_ctx.ctx = hook_set_with_ctx.hook_set.onQuery(hook_set_with_ctx.ctx, query_begin_context)
            })
         },
         onResult: (query_complete_context: T.QueryCompleteContext) => {
            _.forEach(hooks_to_run, hook_set_with_ctx => {
               if (_.isNil(hook_set_with_ctx.hook_set.onResult)) {
                  return
               }
               hook_set_with_ctx.ctx = hook_set_with_ctx.hook_set.onResult(hook_set_with_ctx.ctx, query_complete_context)
            })
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

   async performDbCall<T extends object = any, P extends object = T.TinyPgParams>(
      db_call: DbCall,
      hooks: T.TinyHookLifecycle,
      params?: P,
      query_id?: string
   ): Promise<T.Result<T>> {
      log('performDbCall', db_call.config.name)
      // pass in outside ctx from hoo

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

      let submit_context: T.QuerySubmitContext = null

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
            // Query hook
            // begin_context.caller_context = this.runQueryHooks(this.hook_collection.onQuery, begin_context)

            this.events.emit('query', begin_context)

            log('executing', db_call.config.name)

            const values: any[] = _.map(db_call.config.parameter_map, m => {
               if (!_.has(params, m.name)) {
                  throw new Error(`Missing expected key [${m.name}] on input parameters.`)
               }

               return _.get(params, m.name)
            })

            const query: Pg.Submittable & { callback: (err: Error, result: Pg.QueryResult) => void } = db_call.config.prepared
               ? (<any>Pg.Query)({
                    name: db_call.prepared_name,
                    text: db_call.config.parameterized_query,
                    values,
                 })
               : (<any>Pg.Query)(db_call.config.parameterized_query, values)

            const original_submit = query.submit

            query.submit = (connection: any) => {
               const submitted_at = Date.now()
               submit_context = { ...begin_context, submit: submitted_at, wait_duration: submitted_at - begin_context.start }

               // Submit hook
               hooks.onSubmit(submit_context)

               this.events.emit('submit', submit_context)
               original_submit.call(query, connection)
            }

            const result = await new Promise<Pg.QueryResult>((resolve, reject) => {
               query.callback = (err, res) => (err ? reject(err) : resolve(res))
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

      const createCompleteContext = (error: any, data: T.Result<T>): T.QueryCompleteContext => {
         const end_at = Date.now()
         const query_duration = end_at - start_at

         const timings = _.isNil(submit_context)
            ? {
                 submit: null,
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
            ...timings,
            end: end_at,
            duration: query_duration,
            error: error,
            data: data,
         }
      }

      try {
         const data = await Promise.race([connection_failed_promise, query_promise()])

         const complete_context = createCompleteContext(null, data)

         hooks.onResult(complete_context)

         this.events.emit('result', complete_context)

         return data
      } catch (e) {
         const tiny_stack = `[${db_call.config.name}]\n\n${db_call.config.text}\n\n${e.stack}`
         const tiny_error = new E.TinyPgError(`${e.message}`, tiny_stack, createCompleteContext(e, null))

         this.events.emit('result', tiny_error.queryContext)

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
         const hash_code = Util.hashCode(config.parameterized_query)
            .toString()
            .replace('-', 'n')
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
      const parsed = P.parseSql(formatted_sql)

      const new_db_call = new DbCall({
         ...this.db_call.config,
         text: formatted_sql,
         parameterized_query: parsed.parameterized_sql,
         parameter_map: parsed.mapping,
      })

      return new FormattableDbCall(new_db_call, this.db)
   }

   query<T extends object = any>(params: T.TinyPgParams = {}): Promise<T.Result<T>> {
      //const query_id = Uuid.v4()
      const hook_lifecycle = this.db.makeHooksLifeCycle()
      // hook_lifecycle.preRawQuery({ query_id: query_id }, this.db_call.config.)
      return this.db.performDbCall<T>(this.db_call, hook_lifecycle, params)
   }
}
