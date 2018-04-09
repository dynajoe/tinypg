export interface TinyPgOptions {
   root_dir: string[]
   connection_string: string
   error_transformer: Function
}

export interface Result<T> {
   rows: T[]
   command: string
   row_count: number
}

export interface QueryBeginContext {
   id: string
   sql: string
   start: number
   name: string
   params: Object
}

export interface QueryCompleteContext extends QueryBeginContext {
   end: number
   duration: number
   data: Result<any>
   error?: Error
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

export type TinyPgErrorTransformer = (error: TinyPgError) => any

export interface Disposable {
   dispose(): void
}
