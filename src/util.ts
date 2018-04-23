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

   const accessor: { stack: string } = { stack: null }
   const stack_trace_error = new Error(`TinyPg Captured Stack Trace`)

   Object.defineProperty(accessor, 'stack', {
      get() {
         return stack_trace_error.stack.replace(/\s+at .+\.stackTraceAccessor/, '')
      },
   })

   try {
      return await fn()
   } catch (error) {
      error.stack = `${error.stack ? `${error.stack}\nFrom: ` : ''}${stack_trace_error.stack}`
      throw error
   }
}
