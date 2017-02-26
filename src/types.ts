import * as Pg from 'pg'

export interface TinyPgOptions {
   root_dir: string[]
   connection_string: string
   snake: boolean
   error_transformer: Function
}

export interface Result<T> extends Pg.QueryResult {
   rows: T[]
}

export interface SqlCall<T> {
   (params?: Object): Promise<Result<T>>
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

export interface StackTraceAccessor {
   stack: string
}

export class TinyPgError extends Error {
   name: string
   message: string
   stack: string
   queryContext: any

   constructor(message: string) {
      super()

      Object.setPrototypeOf(this, TinyPgError.prototype)

      this.name = this.constructor.name
      this.message = message
   }
}

export interface Disposable {
   dispose(): void
}
