import * as T from './types'
import * as _ from 'lodash'
import * as Fs from 'fs'
import * as Path from 'path'
import * as E from './errors'
import { parseSql } from 'tinypg-parser'

const Glob = require('glob')

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
            const path_parts = _.compact(path.dir.split('/').concat(path.name))
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
      const message = `Conflicting sql source paths found (${_.map(conflicts, c => {
         return c[0].relative_path
      }).join(', ')}). All source files under root dirs must have different relative paths.`

      throw new E.TinyPgError(message)
   }

   return result
}
