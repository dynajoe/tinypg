import * as T from './types'
import * as _ from 'lodash'
import * as Fs from 'fs'
import * as Path from 'path'
import * as E from './errors'

const Glob = require('glob')

type ParserStateKey =
   | 'query'
   | 'quoted-ident'
   | 'string-constant'
   | 'line-comment'
   | 'block-comment'
   | 'consuming-ident'
   | 'skip-next'
   | 'dollar-quote-literal'

interface ParserState {
   key: ParserStateKey
   data?: any
}

const Token = {
   COLON: ':',
   BACK_SLASH: '\\',
   FORWARD_SLASH: '/',
   SINGLE_QUOTE: "'",
   DASH: '-',
   STAR: '*',
   NEW_LINE: '\n',
   DOLLAR: '$',
   DOUBLE_QUOTE: '"',
}

const IdentRegex = /\w|\./

const IdentStartRegex = /[a-zA-Z_]/

export function parseSql(sql: string): T.SqlParseResult {
   let state: ParserState = { key: 'query' }
   let param_mapping: T.ParamMapping[] = []
   let result = ''

   const pushParam = () => {
      if (state.key === 'consuming-ident') {
         if (!_.some(param_mapping, m => m.name === state.data)) {
            const next_index = _.size(param_mapping) + 1
            param_mapping.push({ name: state.data, index: next_index })
         }

         result += `$${_.find(param_mapping, m => m.name === state.data).index}`
      }
   }

   const text_length = _.size(sql)

   for (let i = 0; i < text_length; i++) {
      const ctx = { current: sql[i], previous: sql[i - 1], next: sql[i + 1] }

      switch (state.key) {
         case 'query':
            if (ctx.current === Token.COLON && ctx.previous != Token.COLON && IdentStartRegex.test(ctx.next)) {
               state = { key: 'consuming-ident', data: '' }
            } else if (ctx.current === Token.SINGLE_QUOTE && ctx.previous !== Token.BACK_SLASH) {
               result += ctx.current
               state = { key: 'string-constant' }
            } else if (ctx.current === Token.DASH && ctx.next === Token.DASH) {
               result += ctx.current + ctx.next
               state = { key: 'skip-next', data: { key: 'line-comment' } }
            } else if (ctx.current === Token.FORWARD_SLASH && ctx.next === Token.STAR) {
               result += ctx.current + ctx.next
               state = { key: 'skip-next', data: { key: 'block-comment', data: 1 } }
            } else if (ctx.current === Token.DOLLAR && ctx.previous === Token.DOLLAR) {
               result += ctx.current
               state = { key: 'dollar-quote-literal' }
            } else if (ctx.current === Token.DOUBLE_QUOTE) {
               result += ctx.current
               state = { key: 'quoted-ident' }
            } else {
               result += ctx.current
            }
            break
         case 'block-comment':
            result += ctx.current

            if (ctx.previous === Token.STAR && ctx.current === Token.FORWARD_SLASH) {
               if (state.data - 1 === 0) {
                  state = { key: 'query' }
               } else {
                  state = { ...state, data: state.data - 1 }
               }
            }
            break
         case 'line-comment':
            result += ctx.current

            if (ctx.current === Token.NEW_LINE) {
               state = { key: 'query' }
            }
            break
         case 'string-constant':
            result += ctx.current

            if (ctx.current === Token.SINGLE_QUOTE && ctx.previous !== Token.BACK_SLASH) {
               state = { key: 'query' }
            }
            break
         case 'consuming-ident':
            if (IdentRegex.test(ctx.current)) {
               state = { ...state, data: state.data + ctx.current }
            } else {
               pushParam()
               result += ctx.current
               state = { key: 'query' }
            }
            break
         case 'dollar-quote-literal':
            result += ctx.current

            if (ctx.current === Token.DOLLAR && ctx.previous === Token.DOLLAR) {
               state = { key: 'query' }
            }
            break
         case 'quoted-ident':
            result += ctx.current

            if (ctx.current === Token.DOUBLE_QUOTE) {
               state = { key: 'query' }
            }
            break
         case 'skip-next':
            state = state.data
            break
         default:
            const _exhaustive_check: never = state.key
            return _exhaustive_check
      }
   }

   pushParam()

   return { statement: result, mapping: param_mapping }
}

export function parseFiles(root_directories: string[]): T.SqlFile[] {
   const result = _.flatMap(
      root_directories,
      (root_dir): T.SqlFile[] => {
         const root_path: string = Path.resolve(root_dir)
         const glob_pattern: string = Path.join(root_path, './**/*.sql')
         const files: string[] = Glob.sync(glob_pattern)

         return _.map(files, f => {
            const relative_path = f.substring(root_path.length + 1)
            const path = Path.parse(relative_path)

            const file_contents = Fs.readFileSync(f, 'utf8')
            const path_parts = _.compact(path.dir.split(Path.sep).concat(path.name))
            const sql_name = path_parts.join('_')
            const sql_key = path_parts.join('.')

            return {
               name: sql_name,
               key: sql_key,
               path: f,
               relative_path,
               text: file_contents,
               path_parts,
               parsed: parseSql(file_contents),
            }
         })
      }
   )

   const conflicts = _.filter(_.groupBy(result, x => x.name), x => x.length > 1)

   if (conflicts.length > 0) {
      const message = `Conflicting sql source paths found (${_
         .map(conflicts, c => {
            return c[0].relative_path
         })
         .join(', ')}). All source files under root dirs must have different relative paths.`

      throw new E.TinyPgError(message)
   }

   return result
}
