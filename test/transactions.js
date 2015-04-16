var Tiny = require('../src/index')
var Q = require('q');
var Pg = require('pg');
var expect = require('chai').expect;
var setUpDb = require('./helper').setUpDb;
var getA = require('./helper').getA;
var newTiny = require('./helper').newTiny;
var dbName = require('./helper').dbName;

describe('Transactions', function () {
   var tiny;

   beforeEach(function (done) {
      setUpDb(function (err) {
         if (err) {
            return done(err);
         }

         tiny = newTiny();

         done();
      });
   });

   describe('Sql file queries', function () {
      it('should commit successful transactions', function (done) {
         tiny.transaction(function (ctx) {
            var queries = [1, 2, 3].map(function (v) {
               return ctx.sql.a.insert({ text: v.toString() });
            });

            return Q.all(queries);
         })
         .then(function (err) {
            getA().then(function (res) {
               expect(res.rows).to.have.length(3);
               done()
            });
         });
      });

      it('should rollback failed transactions', function (done) {
         tiny.transaction(function (ctx) {
            return ctx.sql.a.insert({
               text: 'TEST'
            })
            .then(function () {
               throw new Error('THIS SHOULD ABORT')
            })
         })
         .catch(function (err) {
            getA().then(function (res) {
               expect(res.rows).to.have.length(0);
               done();
            });
         });
      });
   });

   describe('Raw queries', function () {
      it('should commit successful transactions', function (done) {
         tiny.transaction(function (ctx) {
            return ctx.query('INSERT INTO ' + dbName + '.a (text) VALUES (:text)', {
               text: 'TEST'
            });
         })
         .then(function (err) {
            getA().then(function (res) {
               expect(res.rows).to.have.length(1);
               done();
            });
         });
      });

      it('should rollback failed transactions', function (done) {
         tiny.transaction(function (ctx) {
            return ctx.query('INSERT INTO ' + dbName + '.a (text) VALUES (:text)', {
               text: 'TEST'
            })
            .then(function () {
               throw new Error('THIS SHOULD ABORT')
            })
         })
         .catch(function (err) {
            getA().then(function (res) {
               expect(res.rows).to.have.length(0);
               done();
            });
         });
      });

   });
});