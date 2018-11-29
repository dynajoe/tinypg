import { EventEmitter } from 'events'
import { TinyPgErrorTransformer } from './errors'
import { TlsOptions } from 'tls'

export type HookCollection = { [P in keyof Required<TinyHooks>]: TinyHooks[P][] }

export interface PreSqlHookResult {
   name: string
   params: TinyPgParams
   caller_context: any
}

export interface PreRawQueryHookResult {
   raw_sql: string
   params: TinyPgParams
   caller_context: any
}

export interface TinyHooks {
   preSql?: (name: string, query_id: string, params?: TinyPgParams, context?: any) => PreSqlHookResult
   preRawQuery?: (rawSql: string, query_id: string, params?: TinyPgParams, context?: any) => PreRawQueryHookResult
   // TODO transaction
   onQuery?: (query_begin_context: QueryBeginContext) => any
   onSubmit?: (query_submit_context: QuerySubmitContext) => any
   onResult?: (query_complete_context: QueryCompleteContext) => any
}

export interface TinyPgOptions {
   connection_string: string
   tls_options?: TlsOptions
   root_dir?: string | string[]
   use_prepared_statements?: boolean
   error_transformer?: TinyPgErrorTransformer
   capture_stack_trace?: boolean
   hooks: TinyHooks
   pool_options?: {
      max?: number
      min?: number
      connection_timeout_ms?: number
      idle_timeout_ms?: number
      application_name?: string
      statement_timeout_ms?: number
      keep_alive?: boolean
   }
}

export type TinyPgPrimitive = string | number | boolean | object | Buffer | Date

export type TinyPgParams = undefined | null | object | { [key: string]: null | undefined | TinyPgPrimitive | TinyPgPrimitive[] }

export interface Result<T extends object> {
   rows: T[]
   command: string
   row_count: number
}

export interface ContextCallable {
   caller_context?: any
}

export interface QueryBeginContext extends ContextCallable {
   id: string
   sql: string
   start: number
   name: string
   params: TinyPgParams
}

export interface QuerySubmitContext extends QueryBeginContext {
   wait_duration: number
   submit: number
}

export interface QueryCompleteContext extends QuerySubmitContext {
   end: number
   duration: number
   active_duration: number
   data: Result<any> | null
   error: Error | null
}

export interface SqlParseResult {
   parameterized_sql: string
   mapping: ParamMapping[]
}

export interface ParamMapping {
   index: number
   name: string
}

export interface SqlFile {
   name: string
   key: string
   path: string
   path_parts: string[]
   relative_path: string
   text: string
   parsed: SqlParseResult
}

export interface DbCallConfig {
   name: string
   key: string | null
   parameter_map: ParamMapping[]
   parameterized_query: string
   text: string
   prepared: boolean
}

export interface Disposable {
   dispose(): void
}

export interface TinyPgEvents extends EventEmitter {
   on(event: 'query', listener: (x: QueryBeginContext) => void): this

   on(event: 'result', listener: (x: QueryCompleteContext) => void): this

   on(event: 'submit', listener: (x: QuerySubmitContext) => void): this

   emit(event: 'query' | 'submit' | 'result', ...args: any[]): boolean
}

declare module 'pg' {
   export interface PoolConfig {
      log?: any
      statement_timeout?: number
   }
}
