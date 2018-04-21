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
