import { TinyPg } from '../'
import * as H from './helper'
import { expect } from 'chai'

describe('Transactions', () => {
   let tiny: TinyPg

   beforeEach(() => {
      tiny = H.newTiny()
      return H.setUpDb()
   })

   describe('Sql file queries', () => {
      it('should commit successful transactions', () => {
         return tiny.transaction(ctx => {
            const queries = [1, 2, 3].map(v => {
               return ctx.sql('a.insert', { text: v.toString() })
            })

            return Promise.all(queries)
         })
         .then(() => {
            return H.getA().then(res => {
               expect(res.rows).to.have.length(3)
            })
         })
      })

      it('should rollback failed transactions', () => {
         return tiny.transaction(ctx => {
            return ctx.sql('a.insert', {
               text: 'TEST',
            })
            .then(() => {
               throw new Error('THIS SHOULD ABORT')
            })
         })
         .catch(() => {
            return H.getA().then(res => {
               expect(res.rows).to.have.length(0)
            })
         })
      })
   })

   describe('Raw queries', () => {
      it('should commit successful transactions', () => {
         return tiny.transaction(ctx => {
            return ctx.query('INSERT INTO __tiny_test_db.a (text) VALUES (:text)', {
               text: 'TEST',
            })
         })
         .then(() => {
            return H.getA().then(res => {
               expect(res.rows).to.have.length(1)
            })
         })
      })

      it('should rollback failed transactions', () => {
         return tiny.transaction(ctx => {
            return ctx.query('INSERT INTO __tiny_test_db.a (text) VALUES (:text)', {
               text: 'TEST',
            })
            .then(() => {
               throw new Error('THIS SHOULD ABORT')
            })
         })
         .catch(() => {
            return H.getA().then(res => {
               expect(res.rows).to.have.length(0)
            })
         })
      })
   })

   describe('Nested Transactions', () => {
      it('should commit successful transactions', () => {
         return tiny.transaction(ctx => {
            return ctx.query('INSERT INTO __tiny_test_db.a (text) VALUES (:text)', {
               text: '1',
            })
            .then(() => {
               return ctx.transaction(ctx2 => {
                  return ctx2.query('INSERT INTO __tiny_test_db.a (text) VALUES (:text)', {
                     text: '2',
                  })
               })
            })
         })
         .then(() => {
            return H.getA().then(res => {
               expect(res.rows).to.have.length(2)
            })
         })
      })

      it('should rollback on a failed inner transaction', () => {
         return tiny.transaction(ctx => {
            return ctx.query('INSERT INTO __tiny_test_db.a (text) VALUES (:text)', {
               text: '1',
            })
            .then(() => {
               return ctx.transaction(ctx2 => {
                  return ctx2.query('INSERT INTO __tiny_test_db.a (text) VALUES (:text)', {
                     text: '1',
                  })
                  .then(() => {
                     throw new Error('THIS SHOULD ABORT')
                  })
               })
            })
         })
         .catch(() => {
            return H.getA().then(res => {
               expect(res.rows).to.have.length(0)
            })
         })
      })
   })
})
