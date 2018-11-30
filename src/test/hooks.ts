import * as H from './helper'
import { expect } from 'chai'
import { TinyPg } from '../'
import * as AsyncHooks from 'async_hooks'

// forces PromiseHooks to be enabled.
AsyncHooks.createHook({ init() {} }).enable()

describe('Hooks', () => {
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
            console.log(final_context)
            expect(final_context.foo).to.equal('bar')
            expect(final_context.onQuery).to.exist
            expect(final_context.onSubmit).to.exist
            expect(final_context.onResult).to.exist
         })
      })
   })

   describe('with async_hooks', () => {
      let final_context = null
      let hooked_tiny = null

      beforeEach(() => {
         hooked_tiny = tiny.withHooks({
            preSql: (ctx, name, params) => {
               return {
                  ctx: { ...ctx, preSql: { async_id: AsyncHooks.executionAsyncId(), trigger_id: AsyncHooks.triggerAsyncId() } },
                  args: [name, params],
               }
            },
            onQuery(ctx) {
               return { ...ctx, onQuery: { async_id: AsyncHooks.executionAsyncId(), trigger_id: AsyncHooks.triggerAsyncId() } }
            },
            onSubmit(ctx) {
               return { ...ctx, onSubmit: { async_id: AsyncHooks.executionAsyncId(), trigger_id: AsyncHooks.triggerAsyncId() } }
            },
            onResult(ctx) {
               final_context = { ...ctx, onResult: { async_id: AsyncHooks.executionAsyncId(), trigger_id: AsyncHooks.triggerAsyncId() } }
               return final_context
            },
         })
      })

      it('should run preSql in the same execution context', async () => {
         const caller_async_execution_id = AsyncHooks.executionAsyncId()

         await hooked_tiny.sql('a.select')

         expect(caller_async_execution_id).to.not.equal(0)
         expect(final_context.preSql.async_id).to.equal(caller_async_execution_id)
      })
   })
})
