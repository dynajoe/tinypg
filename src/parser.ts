import * as T from './types'
import * as _ from 'lodash'
import * as Fs from 'fs'
import * as Path from 'path'

const Glob = require('glob')

export function parseSql(sql: string): T.SqlParseResult {
   const validStartChar = /\w/
   const validChar = /(\w|\.)/
   const result: string[] = []
   const mapping: T.ParamMapping[] = []
   const keys: Record<string, T.ParamMapping> = {}

   let singleLineComment = false
   let multiLineComment = 0
   let consumeVar = false
   let buffer: string[] = []
   let varIdx: number = 0
   let inString = false

   const pushVar = () => {
      const name = buffer.join('')

      if (keys[name]) {
         result.push(`$${keys[name].index}`)
      } else {
         varIdx++

         keys[name] = {
            index: varIdx,
            name: buffer.join(''),
         }

         mapping.push(keys[name])
         result.push(`$${varIdx}`)
      }

      buffer = []
      consumeVar = false
   }

   const pushText = () => {
      result.push(buffer.join(''))
      buffer = []
   }

   for (let i = 0; i < sql.length; i++) {
      const c = sql[i]
      const n = sql[i + 1]
      const p = sql[i - 1]

      if (!multiLineComment && !singleLineComment && c === '\'' && p !== '\\') {
         inString = !inString
      } else if (!inString && c === '-' && p === '-') {
         singleLineComment = true
      } else if (singleLineComment && c === '\n') {
         singleLineComment = false
      } else if (c === '*' && p === '/') {
         multiLineComment++
      } else if (c === '/' && p === '*') {
         multiLineComment = Math.max(0, multiLineComment - 1)
      }

      if (inString || singleLineComment || multiLineComment > 0) {
         buffer.push(c)
      } else {
         if (consumeVar && !validChar.test(c)) {
            pushVar()
         } else if (c === ':' && p !== ':' && validStartChar.test(n)) {
            consumeVar = true
            pushText()
            continue
         }

         buffer.push(c)
      }
   }

   consumeVar ? pushVar() : pushText()

   return {
      parameterized_sql: result.join(''),
      mapping: mapping,
   }
}

export function parseFiles(root_directories: string[], path_transformer: (p: string) => string): T.SqlFile[] {
   const result = _.flatMap(root_directories, (root_dir): T.SqlFile[] => {
      const root_path: string = Path.resolve(root_dir)
      const glob_pattern: string = Path.join(root_path, './**/*.sql')
      const files: string[] = Glob.sync(glob_pattern)

      return _.map(files, f => {
         const relative_path = f.substring(root_path.length + 1)
         const path = Path.parse(relative_path)

         const file_contents = Fs.readFileSync(f).toString().trim()
         const path_parts = _.map(path.dir.split(Path.sep).concat(path.name), path_transformer)
         const sql_name = path_parts.join('_')
         const sql_key = path_parts.join('.')

         return {
            name: sql_name,
            key: sql_key,
            path: f,
            relative_path,
            text: file_contents,
            path_parts,
            parsed:  parseSql(file_contents),
         }
      })
   })

   const conflicts = _.filter(_.groupBy(result, x => x.name), x => x.length > 1)

   if (conflicts.length > 0) {
      const message = `Conflicting sql source paths found (${_.map(conflicts, c => {
         return c[0].relative_path
      }).join(', ')}). All source files under root dirs must have different relative paths.`

      throw new T.TinyPgError(message)
   }

   return result
}
