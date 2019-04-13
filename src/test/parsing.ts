import * as P from '../parser'
import * as T from '../types'
import { expect } from 'chai'
import * as Path from 'path'
import * as _ from 'lodash'

describe('parseFiles', () => {
   let result: T.SqlFile[]

   beforeEach(() => {
      result = P.parseFiles([Path.join(__dirname, './sql')])
   })

   it('should parse files', () => {
      const parse_file_marker = _.find(result, x => x.key.indexOf('parse_file_test_marker') != -1)
      expect(parse_file_marker.name).to.equal('a_parse_file_test_marker')
      expect(parse_file_marker.relative_path).to.equal('a/parse_file_test_marker.sql')
   })

   it('shoul correctly format root level file names', () => {
      const root_level_file = _.find(result, x => x.key.indexOf('root_level_sql_file') != -1)
      expect(root_level_file.name).to.equal('root_level_sql_file')
      expect(root_level_file.relative_path).to.equal('root_level_sql_file.sql')
   })
})
