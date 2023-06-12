import * as H from './helper'
import { TinyPg } from '../'
import { expect } from 'chai'
import * as T from '../types'

describe('Tiny', () => {
   let tiny: TinyPg

   beforeEach(() => {
      tiny = H.newTiny()

      return H.setUpDb().then(() => {
         return ['a', 'b', 'c'].reduce((chain, v) => {
            return chain.then<any>(() => H.insertA(v))
         }, Promise.resolve())
      })
   })

   describe('SQL file queries', () => {
      it('should return the postgres modules result', () => {
         return tiny.sql('a.select').then(res => {
            expect(res.rows).to.deep.equal([
               { id: 1, text: 'a' },
               { id: 2, text: 'b' },
               { id: 3, text: 'c' },
            ])
         })
      })

      it('should isolate if asked', () => {
         const iso = tiny.isolatedEmitter()

         let onQueryDataA: any
         let onResultDataA: any
         let onQueryDataB: any
         let onResultDataB: any

         tiny.events.on('query', (e: any) => {
            onQueryDataA = e
         })

         tiny.events.on('result', (e: any) => {
            onResultDataA = e
         })

         iso.events.on('query', (e: any) => {
            onQueryDataB = e
         })

         iso.events.on('result', (e: any) => {
            onResultDataB = e
         })

         return iso.sql('a.select').then(res => {
            expect(onQueryDataA).to.not.exist
            expect(onResultDataA).to.not.exist

            expect(onQueryDataB).to.exist
            expect(onResultDataB).to.exist

            iso.dispose()

            tiny.events.removeAllListeners()

            expect(res.rows).to.deep.equal([
               { id: 1, text: 'a' },
               { id: 2, text: 'b' },
               { id: 3, text: 'c' },
            ])
         })
      })

      it('should emit events', () => {
         let onQueryData: T.QueryBeginContext
         let onResultData: T.QueryCompleteContext
         let onSubmitData: T.QuerySubmitContext

         tiny.events.on('query', (e: any) => {
            onQueryData = e
         })

         tiny.events.on('submit', (e: any) => {
            onSubmitData = e
         })

         tiny.events.on('result', (e: any) => {
            onResultData = e
         })

         return tiny.sql('a.select').then(res => {
            expect(onQueryData).not.to.be.null
            expect(onSubmitData).not.to.be.null
            expect(onResultData).not.to.be.null

            expect(onQueryData.name).to.equal('a_select')
            expect(onSubmitData.submit).to.be.least(onQueryData.start)
            expect(onSubmitData.wait_duration).to.be.least(0)
            expect(onResultData.duration).to.be.least(0)

            tiny.events.removeAllListeners()

            expect(res.rows).to.deep.equal([
               { id: 1, text: 'a' },
               { id: 2, text: 'b' },
               { id: 3, text: 'c' },
            ])
         })
      })

      describe('that have format parameters', () => {
         it('should perform the replacements', () => {
            return tiny
               .formattable('a.test_format')
               .format('a')
               .query({ a: 'a' })
               .then(res => {
                  expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }])
               })
         })
      })

      describe('that have nested parameters', () => {
         it('should perform the replacements', () => {
            return tiny.sql('a.test_nested', { a: { foo: 'a' } }).then(res => {
               expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }])
            })
         })
      })

      describe('that have missing parameters', () => {
         it('should perform the replacements', () => {
            return tiny.sql('a.test_missing_params', { a: 'a' }).catch(err => {
               expect(err).to.be.instanceof(T.TinyPgError)
               expect(err).to.have.property('queryContext')
               expect(err.message).to.include('this_is_the_missing_param')
            })
         })
      })

      describe('that have format parameters that inject variables', () => {
         it('should perform the replacements', () => {
            return tiny
               .formattable('a.test_multi_format')
               .format(`__tiny_test_db.a WHERE text = :a OR text = :b`)
               .query({ a: 'a', b: 'b' })
               .then(res => {
                  expect(res.rows).to.deep.equal([
                     { id: 1, text: 'a' },
                     { id: 2, text: 'b' },
                  ])
               })
         })
      })

      describe('that perform multiple formats', () => {
         it('should perform the replacements', () => {
            return tiny
               .formattable('a.test_multi_format')
               .format(`__tiny_test_db.a WHERE text = %L`)
               .format('a')
               .query()
               .then(res => {
                  expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }])
               })
         })
      })

      describe('that throws an error', () => {
         it('should wrap the error with the queryContext', () => {
            return tiny.sql('a.query_with_error').catch(err => {
               expect(err).to.be.instanceof(T.TinyPgError)
               expect(err).to.have.property('queryContext')
               expect(err.queryContext).to.not.have.property('context')
               expect(err.queryContext.error.code).to.equal('42P01')
               expect(err.message).to.include('blah_doesnt_exist')
            })
         })

         it('should have information about the query', () => {
            return tiny
               .sql('a.query_with_error')
               .then(() => expect.fail('not supposed to succeed'))
               .catch(err => {
                  expect(err.stack).to.include('query_with_error')
               })
         })

         it('should have the correct stack trace', () => {
            const thisShouldBeInStack = () => {
               return H.newTiny({ capture_stack_trace: true }).sql('a.query_with_error')
            }

            return thisShouldBeInStack().catch(err => {
               expect(err.stack).to.include('thisShouldBeInStack')
            })
         })
      })
   })

   describe('Raw queries', () => {
      it('should return the postgres modules result', () => {
         return tiny.query('SELECT * FROM __tiny_test_db.a').then(res => {
            expect(res.rows).to.deep.equal([
               { id: 1, text: 'a' },
               { id: 2, text: 'b' },
               { id: 3, text: 'c' },
            ])
         })
      })

      describe('When an error is thrown', () => {
         it('should have appropriate metadata', () => {
            return tiny.query('SELECT THIS_WILL_THROW_ERROR;').catch(err => {
               expect(err).to.be.instanceof(T.TinyPgError)
               expect(err).to.have.property('queryContext')
               expect(err.queryContext.error.code).to.equal('42703')
               expect(err.queryContext).to.not.have.property('context')
               expect(err.message).to.include('does not exist')
            })
         })

         it('should have information about the query', () => {
            return tiny
               .query('SELECT THIS_WILL_THROW_ERROR;')
               .then(() => expect.fail('not supposed to succeed'))
               .catch(err => {
                  expect(err.stack).to.include('THIS_WILL_THROW_ERROR')
               })
         })

         it('should have the correct stack trace', () => {
            const thisShouldBeInStack = () => {
               return H.newTiny({ capture_stack_trace: true }).query('SELECT THIS_WILL_THROW_ERROR;')
            }

            return thisShouldBeInStack().catch(err => {
               expect(err.stack).to.include('thisShouldBeInStack')
            })
         })
      })
   })

   describe('types', () => {
      it('should fall back to any if no type param is specified', () => {
         const tiny = H.newTiny()

         interface R {
            a: number
            b: number
         }

         const fn = (): Promise<R> => {
            return tiny.sql('a.test_nested', { a: { foo: 1 } }).then(res => {
               return { ...res.rows[0] }
            })
         }

         return fn()
      })
   })

   it('should allow creating an instance of tiny without directory', () => {
      const tiny = new TinyPg({
         connection_string: H.connection_string,
      })

      return tiny.query('SELECT 1 as x').then(res => {
         expect(res.rows).to.deep.equal([{ x: 1 }])
      })
   })

   it('should transform errors', () => {
      const expectedError = { foo: 'bar' }

      const tiny = new TinyPg({
         connection_string: H.connection_string,
         error_transformer: () => {
            return expectedError
         },
      })

      return tiny.query('SELECT THIS_WILL_THROW_ERROR;').catch(err => {
         expect(err).to.deep.equal(expectedError)
      })
   })
})
