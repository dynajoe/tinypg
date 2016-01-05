var Tiny = require('../src/index');
var Q = require('q');
var Pg = require('pg');
var expect = require('chai').expect;
var setUpDb = require('./helper').setUpDb;
var getA = require('./helper').getA;
var newTiny = require('./helper').newTiny;
var dbSchema = require('./helper').dbSchema;

describe('Transactions', function () {
   var tiny;

   beforeEach(function () {
      return setUpDb()
      .then(function () {
         tiny = newTiny();
      });
   });

   describe('Sql file queries', function () {
      it('should commit successful transactions', function () {
         return tiny.transaction(function (ctx) {
            var queries = [1, 2, 3].map(function (v) {
               return ctx.sql.a.insert({ text: v.toString() });
            });

            return Q.all(queries);
         })
         .then(function (err) {
            return getA().then(function (res) {
               expect(res.rows).to.have.length(3);
            });
         });
      });

      it('should rollback failed transactions', function () {
         return tiny.transaction(function (ctx) {
            return ctx.sql.a.insert({
               text: 'TEST'
            })
            .then(function () {
               throw new Error('THIS SHOULD ABORT');
            });
         })
         .catch(function (err) {
            return getA().then(function (res) {
               expect(res.rows).to.have.length(0);
            });
         });
      });
   });

   describe('Raw queries', function () {
      it('should commit successful transactions', function () {
         return tiny.transaction(function (ctx) {
            return ctx.query('INSERT INTO ' + dbSchema + '.a (text) VALUES (:text)', {
               text: 'TEST'
            });
         })
         .then(function (err) {
            return getA().then(function (res) {
               expect(res.rows).to.have.length(1);
            });
         });
      });

      it('should rollback failed transactions', function () {
         return tiny.transaction(function (ctx) {
            return ctx.query('INSERT INTO ' + dbSchema + '.a (text) VALUES (:text)', {
               text: 'TEST'
            })
            .then(function () {
               throw new Error('THIS SHOULD ABORT');
            });
         })
         .catch(function (err) {
            return getA().then(function (res) {
               expect(res.rows).to.have.length(0);
            });
         });
      });
   });

   describe('Nested Transactions', function () {
      it('should commit successful transactions', function () {
         return tiny.transaction(function (ctx) {
            return ctx.query('INSERT INTO ' + dbSchema + '.a (text) VALUES (:text)', {
               text: '1'
            })
            .then(function (res) {
               return ctx.transaction(function (ctx2) {
                  return ctx2.query('INSERT INTO ' + dbSchema + '.a (text) VALUES (:text)', {
                     text: '2'
                  });
               });
            });
         })
         .then(function (err) {
            return getA().then(function (res) {
               expect(res.rows).to.have.length(2);
            });
         })
      });

      it('should rollback on a failed inner transaction', function () {
         return tiny.transaction(function (ctx) {
            return ctx.query('INSERT INTO ' + dbSchema + '.a (text) VALUES (:text)', {
               text: '1'
            })
            .then(function (res) {
               return ctx.transaction(function (ctx2) {
                  return ctx2.query('INSERT INTO ' + dbSchema + '.a (text) VALUES (:text)', {
                     text: '1'
                  })
                  .then(function () {
                     throw new Error('THIS SHOULD ABORT');
                  });
               });
            });
         })
         .catch(function (err) {
            return getA().then(function (res) {
               expect(res.rows).to.have.length(0);
            });
         });
      });
   });
});
