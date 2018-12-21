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

         describe('and every hook throws an error', () => {
            it('should catch the errors and return the original ctx', async () => {
               let final_context: any
               let original_context: any

               const hooks: TinyHooks = {
                  preSql: (ctx, _name, _params) => {
                     original_context = ctx

                     throw new Error('Error in preSql')
                  },
                  onQuery(_ctx, _query_begin_context) {
                     throw new Error('Error in onQuery')
                  },
                  onSubmit(_ctx, _query_submit_context) {
                     throw new Error('Error in onSubmit')
                  },
                  onResult(_ctx, _query_complete_context) {
                     final_context = _ctx

                     throw new Error('Error in onResult')
                  },
               }

               const hooks_creation_methods = [H.newTiny({ hooks: hooks }), tiny.withHooks(hooks)]

               for (const my_tiny of hooks_creation_methods) {
                  final_context = null

                  await my_tiny.sql('a.select')

                  expect(final_context).to.deep.equal(original_context)
               }
            })
         })

         describe('and a single hook throws an error', () => {
            it('should catch the error and continue with the rest of the hooks', async () => {
               let final_context: any

               const hooks: TinyHooks = {
                  preSql: (ctx, name, params) => {
                     return { ctx: { ...ctx, foo: 'bar' }, args: [name, params] }
                  },
                  onQuery(_ctx, _query_begin_context) {
                     throw new Error('Error in onQuery')
                  },
                  onSubmit(ctx, _query_submit_context) {
                     return {
                        ...ctx,
                        onSubmit: 'made it',
                     }
                  },
                  onResult(ctx, query_complete_context) {
                     final_context = {
                        ...ctx,
                        ...query_complete_context,
                     }

                     return final_context
                  },
               }

               const hooks_creation_methods = [H.newTiny({ hooks: hooks }), tiny.withHooks(hooks)]

               for (const my_tiny of hooks_creation_methods) {
                  final_context = null

                  await my_tiny.sql('a.select')

                  expect(final_context.onSubmit).to.equal('made it')
               }
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

         describe('and every hook throws an error', () => {
            it('should catch the errors and return the original ctx', async () => {
               let final_context: any
               let original_context: any

               const hooks: TinyHooks = {
                  preRawQuery: (ctx, _name, _params) => {
                     original_context = ctx

                     throw new Error('Error in preRawQuery')
                  },
                  onQuery(_ctx, _query_begin_context) {
                     throw new Error('Error in onQuery')
                  },
                  onSubmit(_ctx, _query_submit_context) {
                     throw new Error('Error in onSubmit')
                  },
                  onResult(_ctx, _query_complete_context) {
                     final_context = _ctx

                     throw new Error('Error in onResult')
                  },
               }

               const hooks_creation_methods = [H.newTiny({ hooks: hooks }), tiny.withHooks(hooks)]

               for (const my_tiny of hooks_creation_methods) {
                  final_context = null

                  await my_tiny.query('SELECT * FROM __tiny_test_db.a')

                  expect(final_context).to.deep.equal(original_context)
               }
            })
         })

         describe('and a single hook throws an error', () => {
            it('should catch the error and continue with the rest of the hooks', async () => {
               let final_context: any

               const hooks: TinyHooks = {
                  preRawQuery: (ctx, name, params) => {
                     return { ctx: { ...ctx, foo: 'bar' }, args: [name, params] }
                  },
                  onQuery(_ctx, _query_begin_context) {
                     throw new Error('Error in onQuery')
                  },
                  onSubmit(ctx, _query_submit_context) {
                     return {
                        ...ctx,
                        onSubmit: 'made it',
                     }
                  },
                  onResult(ctx, query_complete_context) {
                     final_context = {
                        ...ctx,
                        ...query_complete_context,
                     }

                     return final_context
                  },
               }

               const hooks_creation_methods = [H.newTiny({ hooks: hooks }), tiny.withHooks(hooks)]

               for (const my_tiny of hooks_creation_methods) {
                  final_context = null

                  await my_tiny.query('SELECT * FROM __tiny_test_db.a')

                  expect(final_context.onSubmit).to.equal('made it')
               }
            })
         })
      })
   })

   describe('transaction', () => {
      it('should thread transaction context (withHooks and via options)', async () => {
         let final_context: any
         let tx_id: string

         const hooks: TinyHooks = {
            preTransaction: transaction_id => {
               tx_id = transaction_id

               return { preTransaction: transaction_id }
            },
            onBegin(ctx, transaction_id) {
               return { ...ctx, onBegin: transaction_id }
            },
            onCommit(ctx, transaction_id) {
               final_context = { ...ctx, onCommit: transaction_id }
               return { ...ctx, onCommit: transaction_id }
            },
            onRollback(ctx, transaction_id, tx_error) {
               final_context = { ...ctx, onRollback: transaction_id, tx_error: tx_error }
               return final_context
            },
         }

         const hooks_creation_methods = [H.newTiny({ hooks: hooks }), tiny.withHooks(hooks)]

         for (const my_tiny of hooks_creation_methods) {
            final_context = null

            await my_tiny.transaction(async transaction_db => {
               await transaction_db.query('SELECT * FROM __tiny_test_db.a')
            })

            expect(final_context.preTransaction).to.equal(tx_id)
            expect(final_context.onBegin).to.equal(tx_id)
            expect(final_context.onCommit).to.equal(tx_id)
            expect(final_context.onRollback).to.not.exist

            try {
               await my_tiny.transaction(async transaction_db => {
                  await transaction_db.query('SELECT * FROM bobby.tables')
               })
            } catch (error) {}

            expect(final_context.preTransaction).to.equal(tx_id)
            expect(final_context.onBegin).to.equal(tx_id)
            expect(final_context.onCommit).to.not.exist
            expect(final_context.onRollback).to.equal(tx_id)
            expect(final_context.tx_error).to.exist
         }
      })

      describe('and every hook throws an error', () => {
         it('should catch the errors', async () => {
            let pre_tx_id: string
            let commit_tx_id: string
            let rollback_tx_id: string
            let begin_tx_id: string

            const hooks: TinyHooks = {
               preTransaction: transaction_id => {
                  pre_tx_id = transaction_id
                  throw new Error('Error in preTransaction')
               },
               onBegin(_ctx, transaction_id) {
                  begin_tx_id = transaction_id
                  throw new Error('Error in onBegin')
               },
               onCommit(_ctx, transaction_id) {
                  commit_tx_id = transaction_id
                  throw new Error('Error in onCommit')
               },
               onRollback(_ctx, transaction_id) {
                  rollback_tx_id = transaction_id
                  throw new Error('Error in onRollback')
               },
            }

            const resetIds = () => {
               pre_tx_id = null
               commit_tx_id = null
               rollback_tx_id = null
               begin_tx_id = null
            }

            const hooks_creation_methods = [H.newTiny({ hooks: hooks }), tiny.withHooks(hooks)]

            for (const my_tiny of hooks_creation_methods) {
               resetIds()

               await my_tiny.transaction(async transaction_db => {
                  await transaction_db.query('SELECT * FROM __tiny_test_db.a')
               })

               expect(begin_tx_id).to.equal(pre_tx_id)
               expect(commit_tx_id).to.equal(pre_tx_id)
               expect(rollback_tx_id).to.not.exist

               resetIds()

               try {
                  await my_tiny.transaction(async transaction_db => {
                     await transaction_db.query('SELECT * FROM bobby.tables')
                  })
               } catch (error) {}

               expect(begin_tx_id).to.equal(pre_tx_id)
               expect(commit_tx_id).to.not.exist
               expect(rollback_tx_id).to.equal(pre_tx_id)
            }
         })
      })

      describe('and a single hook throws an error', () => {
         it('should catch the error and continue with the rest of the hooks', async () => {
            let final_context: any

            const hooks: TinyHooks = {
               preTransaction: transaction_id => {
                  return { preTransaction: transaction_id }
               },
               onBegin(_ctx, _transaction_id) {
                  throw new Error('Error in onBegin')
               },
               onCommit(ctx, transaction_id) {
                  final_context = { ...ctx, onCommit: transaction_id }

                  return final_context
               },
               onRollback(ctx, transaction_id) {
                  final_context = { ...ctx, onRollback: transaction_id }

                  return final_context
               },
            }

            const reset = () => {
               final_context = null
            }

            const hooks_creation_methods = [H.newTiny({ hooks: hooks }), tiny.withHooks(hooks)]

            for (const my_tiny of hooks_creation_methods) {
               reset()

               await my_tiny.transaction(async transaction_db => {
                  await transaction_db.query('SELECT * FROM __tiny_test_db.a')
               })

               expect(final_context.onCommit).to.equal(final_context.preTransaction)
               expect(final_context.onRollback).to.not.exist

               reset()

               try {
                  await my_tiny.transaction(async transaction_db => {
                     await transaction_db.query('SELECT * FROM bobby.tables')
                  })
               } catch (error) {}

               expect(final_context.onRollback).to.equal(final_context.preTransaction)
               expect(final_context.onCommit).to.not.exist
            }
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
