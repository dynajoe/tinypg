var Tiny = require('../src/index');
var Q = require('q');
var Pg = require('pg');
var expect = require('chai').expect;
var setUpDb = require('./helper').setUpDb;
var insertA = require('./helper').insertA;
var newTiny = require('./helper').newTiny;
var dbSchema = require('./helper').dbSchema;

describe('Tiny', function () {
   beforeEach(function () {
      return setUpDb()
      .then(function () {
         return Q.all(['a', 'b', 'c'].reduce(function (acc, v) {
            return acc.then(function () {
               return insertA(v);
            });
         }, Q()));
      });
   });

   var tests = function (name, options) {
      var tiny;

      beforeEach(function () {
         tiny = newTiny(options);
      });

      describe(name, function () {
         describe('Sql file queries', function () {
            it('should return the postgres modules result', function () {
               return tiny.sql.a.select()
               .then(function (res) {
                  expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }, { id: 2, text: 'b' }, { id: 3, text: 'c' }]);
               });
            });

            describe('that have format parameters', function () {
               it('should perform the replacements', function () {
                  return tiny.sql.a.testFormat.format('a').query({
                     a: 'a'
                  })
                  .then(function (res) {
                     expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }]);
                  });
               });
            });

            describe('that have format parameters that inject variables', function () {
               it('should perform the replacements', function () {
                  return tiny.sql.a.testMultiFormat
                  .format('a WHERE text = :a OR text = :b')
                  .query({
                     a: 'a',
                     b: 'b'
                  })
                  .then(function (res) {
                     expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }, { id: 2, text: 'b' }]);
                  });
               });
            });

            describe('that perform multiple formats', function () {
               it('should perform the replacements', function () {
                  return tiny.sql.a.testMultiFormat
                  .format('a WHERE text = %L')
                  .format('a')
                  .query()
                  .then(function (res) {
                     expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }]);
                  });
               });
            })
         });

         describe('Raw queries', function () {
            it('should return the postgres modules result', function () {
               return tiny.query('SELECT * FROM ' + dbSchema + '.a')
               .then(function (res) {
                  expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }, { id: 2, text: 'b' }, { id: 3, text: 'c' }]);
               });
            });
         });
      })
   };

   tests('Raw Statements');

   tests('Prepared Statements', { prepared: true });
});