import { EventEmitter } from 'events'
import { TinyPgErrorTransformer } from './errors'
import { TlsOptions } from 'tls'

export interface TinyPgOptions {
   connection_string: string
   tls_options?: TlsOptions
   root_dir?: string | string[]
   use_prepared_statements?: boolean
   error_transformer?: TinyPgErrorTransformer
   capture_stack_trace?: boolean
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

export interface QueryBeginContext {
   id: string
   sql: string
   start: number
   name: string
   params: TinyPgParams
}

export interface QueryCompleteContext extends QueryBeginContext {
   end: number
   duration: number
   data: Result<any>[] | null
   error: Error | null
}

export interface SqlParseResult {
   statement: string
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
   query: string
   text: string
   prepared: boolean
}

export interface Disposable {
   dispose(): void
}

export interface TinyPgEvents extends EventEmitter {
   on(event: 'query', listener: (x: QueryBeginContext) => void): this

   on(event: 'result', listener: (x: QueryCompleteContext) => void): this

   emit(event: 'query' | 'result', ...args: any[]): boolean
}

declare module 'pg' {
   export interface PoolConfig {
      log?: any
      statement_timeout?: number
   }
}
