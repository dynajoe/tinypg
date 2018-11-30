import * as H from './helper'
import { expect } from 'chai'
import { TinyPg } from '../'

describe.only('Hooks', () => {
   let tiny: TinyPg

   beforeEach(() => {
      tiny = H.newTiny()

      return H.setUpDb().then(() => {
         return ['a', 'b', 'c'].reduce((chain, v) => {
            return chain.then<any>(() => H.insertA(v))
         }, Promise.resolve())
      })
   })

   describe('preSql', () => {
      describe('options', () => {})
      describe('withHooks', () => {
         it('should thread context', async () => {
            let final_context = null

            const my_tiny = tiny.withHooks({
               preSql: (ctx, name, params) => {
                  return { ctx: { ...ctx, foo: 'bar' }, args: [name, params] }
               },
               onQuery(ctx, query_begin_context) {
                  return { ...ctx, onQuery: query_begin_context }
               },
               onSubmit(ctx, query_submit_context) {
                  return { ...ctx, onSubmit: query_submit_context }
               },
               onResult(ctx, query_complete_context) {
                  final_context = { ...ctx, onResult: query_complete_context }
                  return final_context
               },
            })

            await my_tiny.sql('a.select')

            expect(final_context.foo).to.equal('bar')
            expect(final_context.onQuery).to.not.be.null
            expect(final_context.onSubmit).to.not.be.null
            expect(final_context.onResult).to.not.be.null
         })
      })
   })
})
