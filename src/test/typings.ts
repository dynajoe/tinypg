import * as H from './helper'
import { TinyPg } from '../'
import * as T from '../types'
import { expect } from 'chai'

describe('Tiny', () => {
   let tiny: TinyPg

   beforeEach(() => {
      tiny = H.newTiny()

      return H.setUpDb()
      .then(() => {
         return ['a', 'b', 'c'].reduce((chain, v) => {
            return chain.then<any>(() => H.insertA(v))
         }, Promise.resolve())
      })
   })


   describe('SQL file queries', () => {
      tiny.sql('foo').then(res => res.rows[0].foo)
   })
})
