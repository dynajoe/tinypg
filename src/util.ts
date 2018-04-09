import * as T from './types'

export const LogEnabled = process.env.TINYPG_LOG === 'true'

export function Log(msg: string, ...args: any[]) {
   console.log(msg, ...args)
}

export function hashCode(str: string): number {
   let hash = 0

   if (str.length == 0) {
      return hash
   }

   for (let i = 0, l = str.length; i < l; i++) {
      const ch = str.charCodeAt(i)
      hash = (hash << 5) - hash + ch
      hash |= 0
   }

   return hash
}

export function stackTraceAccessor(): T.StackTraceAccessor {
   const accessor = {}
   const error = new Error()

   Object.defineProperty(accessor, 'stack', {
      get() {
         return error.stack.replace(/\s+at .+\.stackTraceAccessor/, '')
      },
   })

   return <T.StackTraceAccessor>accessor
}
