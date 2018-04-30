import * as H from './helper'
import * as E from '../errors'
import { expect } from 'chai'

describe('Multiple root directories', () => {
   it('should allow specifying multiple directories that do not conflict', () => {
      const tiny = H.newTiny({
         root_dir: [__dirname + '/multi/a_sql', __dirname + '/multi/b_sql'],
      })

      expect(tiny.sql_db_calls['a.insert']).to.exist
      expect(tiny.sql_db_calls['b.insert']).to.exist
   })

   it('should error on naming conflict', () => {
      expect(() => {
         H.newTiny({
            root_dir: [__dirname + '/multi/a_sql', __dirname + '/sql'],
         })
      }).to.throw(E.TinyPgError)
   })
})
