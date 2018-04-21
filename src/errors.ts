export type TinyPgErrorTransformer = (error: TinyPgError) => any

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

export interface StackTraceAccessor {
   stack: string
}
