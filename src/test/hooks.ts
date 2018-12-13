import * as H from './helper'
import { expect } from 'chai'
import { TinyPg } from '../'
import * as AsyncHooks from 'async_hooks'
import { TinyHooks } from '../types'
import * as _ from 'lodash'

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
      describe('context', () => {
         it('should thread context (withHooks and via options)', async () => {
            let final_context: any
            const hooks: TinyHooks = {
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
            }

            const hooks_creation_methods = [H.newTiny({ hooks: hooks }), tiny.withHooks(hooks)]

            for (const my_tiny of hooks_creation_methods) {
               final_context = null

               await my_tiny.sql('a.select')

               expect(final_context.query_id).to.exist
               expect(final_context.foo).to.equal('bar')
               expect(final_context.onQuery).to.exist
               expect(final_context.onSubmit).to.exist
               expect(final_context.onResult).to.exist
            }
         })

         describe('and there is a transaction', () => {
            it('should keep the same transaction_id across multiple sql calls', async () => {
               let transaction_ids = []
               let query_ids = []

               const hooks: TinyHooks = {
                  preSql: (ctx, name, params) => {
                     transaction_ids.push(ctx.transaction_id)
                     query_ids.push(ctx.query_id)
                     return { ctx: { ...ctx, foo: 'bar' }, args: [name, params] }
                  },
                  onQuery(ctx, query_begin_context) {
                     return { ...ctx, onQuery: query_begin_context }
                  },
                  onSubmit(ctx, query_submit_context) {
                     return { ...ctx, onSubmit: query_submit_context }
                  },
                  onResult(ctx, query_complete_context) {
                     return { ...ctx, onResult: query_complete_context }
                  },
               }

               const my_tiny = tiny.withHooks(hooks)

               await my_tiny.transaction(async tx_db => {
                  await tx_db.sql('a.select')
                  await tx_db.sql('a.select')
               })

               const unique_transaction_ids = _.uniq(transaction_ids)
               const unique_query_ids = _.uniq(query_ids)

               expect(unique_transaction_ids).to.have.length(1)
               expect(_.isString(unique_transaction_ids[0])).to.be.true
               expect(unique_query_ids).to.have.length(2)
            })
         })
      })
   })

   describe('raw query', () => {
      describe('context', () => {
         it('should thread context (withHooks and via options)', async () => {
            let final_context: any
            const hooks: TinyHooks = {
               preRawQuery: (ctx, name, params) => {
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
            }

            const hooks_creation_methods = [H.newTiny({ hooks: hooks }), tiny.withHooks(hooks)]

            for (const my_tiny of hooks_creation_methods) {
               final_context = null

               await my_tiny.query('SELECT * FROM __tiny_test_db.a')

               expect(final_context.query_id).to.exist
               expect(final_context.foo).to.equal('bar')
               expect(final_context.onQuery).to.exist
               expect(final_context.onSubmit).to.exist
               expect(final_context.onResult).to.exist
            }
         })

         describe('and there is a transaction', () => {
            it('should keep the same transaction_id across multiple query calls', async () => {
               let transaction_ids = []
               let query_ids = []
               const hooks: TinyHooks = {
                  preRawQuery: (ctx, name, params) => {
                     transaction_ids.push(ctx.transaction_id)
                     query_ids.push(ctx.query_id)
                     return { ctx: { ...ctx, foo: 'bar' }, args: [name, params] }
                  },
                  onQuery(ctx, query_begin_context) {
                     return { ...ctx, onQuery: query_begin_context }
                  },
                  onSubmit(ctx, query_submit_context) {
                     return { ...ctx, onSubmit: query_submit_context }
                  },
                  onResult(ctx, query_complete_context) {
                     return { ...ctx, onResult: query_complete_context }
                  },
               }

               const my_tiny = tiny.withHooks(hooks)

               await my_tiny.transaction(async tx_db => {
                  await tx_db.query('SELECT * FROM __tiny_test_db.a')
                  await tx_db.query('SELECT * FROM __tiny_test_db.a')
               })

               const unique_transaction_ids = _.uniq(transaction_ids)
               const unique_query_ids = _.uniq(query_ids)

               expect(unique_transaction_ids).to.have.length(1)
               expect(_.isString(unique_transaction_ids[0])).to.be.true
               expect(unique_query_ids).to.have.length(2)
            })
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
