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

const debug = require('debug')('tinypg')

export class TinyPg {
   public events: T.TinyPgEvents
   public pool: Pg.Pool
   public sql_db_calls: { [key: string]: DbCall }

   private error_transformer: E.TinyPgErrorTransformer
   private sql_files: T.SqlFile[]

   constructor(options: T.TinyPgOptions) {
      this.events = new EventEmitter()
      this.error_transformer = _.isFunction(options.error_transformer) ? options.error_transformer : _.identity

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
         connectionTimeoutMillis: pool_options.connection_timeout_ms,
         idleTimeoutMillis: pool_options.idle_timeout_ms,
         application_name: pool_options.application_name,
         max: pool_options.max,
         min: pool_options.min,
      }

      this.pool = new Pg.Pool(pool_config)

      this.pool.on('error', error => {
         debug('Error with idle client in pool.', error)
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
               prepared: true,
            })
         }),
         x => x.config.key
      )
   }

   async query<T = any>(raw_sql: string, params: T.TinyPgArguments = {}): Promise<T.Result<T>> {
      const parsed = P.parseSql(raw_sql)

      const db_call = new DbCall({
         name: 'raw_query',
         key: null,
         text: raw_sql,
         parameterized_query: parsed.parameterized_sql,
         parameter_map: parsed.mapping,
         prepared: false,
      })

      return this.performDbCall(db_call, params)
   }

   async sql<T = any>(name: string, params: T.TinyPgArguments = {}): Promise<T.Result<T>> {
      debug('sql', name)

      const db_call: DbCall = this.sql_db_calls[name]

      if (_.isNil(db_call)) {
         throw new Error(`Sql query with name [${name}] not found!`)
      }

      return this.performDbCall<T>(db_call, params)
   }

   formattable(name: string): FormattableDbCall {
      const db_call: DbCall = this.sql_db_calls[name]

      if (_.isNil(db_call)) {
         throw new Error(`Sql query with name [${name}] not found!`)
      }

      return new FormattableDbCall(db_call, this)
   }

   async transaction<T = any>(tx_fn: (db: TinyPg) => Promise<T>): Promise<T> {
      debug('transaction')

      const tx_client = await this.getClient()

      const release_ref = tx_client.release
      tx_client.release = () => {}

      const release = () => {
         debug('RELEASE transaction client')
         tx_client.release = release_ref
         tx_client.release()
      }

      try {
         debug('BEGIN transaction')

         await tx_client.query('BEGIN')

         const tiny_tx: TinyPg = Object.create(this)

         const assertThennable = (tx_fn_result: any) => {
            if (_.isNil(tx_fn_result) || !_.isFunction(tx_fn_result.then)) {
               throw new Error('Expected thennable to be returned from transaction function.')
            }

            return tx_fn_result
         }

         tiny_tx.transaction = <T = any>(tx_fn: (db: TinyPg) => Promise<T>): Promise<T> => {
            debug('inner transaction')
            return assertThennable(tx_fn(tiny_tx))
         }

         tiny_tx.getClient = () => {
            debug('getClient (transaction)')
            return Promise.resolve(tx_client)
         }

         const result = await assertThennable(tx_fn(tiny_tx))

         debug('COMMIT transaction')

         await tx_client.query('COMMIT')

         return result
      } catch (error) {
         debug('ROLLBACK transaction')
         await tx_client.query('ROLLBACK')
         throw error
      } finally {
         release()
      }
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

   async performDbCall<T = any>(db_call: DbCall, params: T.TinyPgArguments): Promise<T.Result<T>> {
      debug('performDbCall', db_call.config.name)

      let call_completed = false
      let client: Pg.PoolClient

      const start_at = Date.now()

      const query_context: T.QueryBeginContext = {
         id: Uuid.v4(),
         sql: db_call.config.parameterized_query,
         start: start_at,
         name: db_call.config.name,
         params,
      }

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

         try {
            this.events.emit('query', query_context)

            debug('executing', db_call.config.name)

            const values: any[] = _.map(db_call.config.parameter_map, m => {
               if (!_.has(params, m.name)) {
                  throw new Error(`Missing expected key [${m.name}] on input parameters.`)
               }

               return _.get(params, m.name)
            })

            const result = db_call.config.prepared
               ? await client.query({
                    name: db_call.prepared_name,
                    text: db_call.config.parameterized_query,
                    values,
                 })
               : await client.query(db_call.config.parameterized_query, values)

            debug('execute result', db_call.config.name)

            return { row_count: result.rowCount, rows: result.rows, command: result.command }
         } catch (error) {
            if (!_.isNil(error) && (!error['code'] || _.startsWith(error['code'], '57P'))) {
               client.release(error)
            } else {
               client.release()
            }

            const tiny_error = new E.TinyPgError(error.message)

            tiny_error.queryContext = query_context

            throw this.error_transformer(tiny_error)
         }
      }

      let error: any
      let data: T.Result<T> = null

      try {
         data = await Promise.race([connection_failed_promise, query_promise()])
         return data
      } finally {
         call_completed = true

         const end_at = Date.now()

         const query_end_result: T.QueryCompleteContext = { ...query_context, end: end_at, duration: end_at - start_at, error: error, data: data }

         this.events.emit('result', query_end_result)
      }
   }

   private getClient(): Promise<Pg.PoolClient> {
      debug('getClient')
      return this.pool.connect()
   }
}

export class DbCall {
   config: T.DbCallConfig
   prepared_name?: string

   constructor(config: T.DbCallConfig) {
      this.config = config

      if (this.config.prepared) {
         this.prepared_name = `${config.name}_${Util.hashCode(config.parameterized_query)
            .toString()
            .replace('-', 'n')}`.substring(0, 63)
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

   query<T = any>(params: T.TinyPgArguments = {}): Promise<T.Result<T>> {
      return this.db.performDbCall<T>(this.db_call, params)
   }
}

export class TinyPgError extends Error {
   name: string
   message: string
   queryContext: any

   constructor(message: string) {
      super()

      Object.setPrototypeOf(this, TinyPgError.prototype)

      this.name = this.constructor.name
      this.message = message
   }
}
