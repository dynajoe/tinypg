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

export async function stackTraceAccessor<T>(is_enabled: boolean, fn: () => Promise<T>): Promise<T> {
   if (!is_enabled) {
      return fn()
   }

   const stack_trace_error = new Error(`TinyPg Captured Stack Trace`)

   try {
      return await fn()
   } catch (error) {
      if (error instanceof Error) {
         error.stack = `${error.stack ? `${error.stack}\nFrom: ` : ''}${stack_trace_error.stack}`
      }

      throw error
   }
}

export function thrownAsError(thrown: unknown): Error {
   if (thrown instanceof Error) {
      return thrown
   }

   try {
      return new Error(JSON.stringify(thrown))
   } catch {
      return new Error(String(thrown))
   }
}
