var Tiny = require('../src/index');
var Q = require('q');
var Pg = require('pg');
var expect = require('chai').expect;
var setUpDb = require('./helper').setUpDb;
var insertA = require('./helper').insertA;
var newTiny = require('./helper').newTiny;
var dbName = require('./helper').dbName;

describe('Select', function () {
   var tiny;

   beforeEach(function (done) {
      setUpDb(function (err) {
         if (err) {
            return done(err);
         }

         tiny = newTiny();

         Q.all(['a', 'b', 'c'].reduce(function (acc, v) {
            return acc.then(insertA.bind(null, v));
         }, Q()))
         .then(function (res) {
            done();
         })
         .catch(done);
      });
   });

   describe('Sql file queries', function () {
      it('should return the postgres modules result', function (done) {
         tiny.sql.a.select()
         .then(function (res) {
            expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }, { id: 2, text: 'b' }, { id: 3, text: 'c' }]);
            done();
         })
         .catch(done);
      });

      describe('that have format parameters', function () {
         it('should perform the replacements', function (done) {
            tiny.sql.a.testFormat.format('a').query({
               a: 'a'
            })
            .then(function (res) {
               expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }]);
               done();
            })
            .catch(done);
         });
      })
   });

   describe('Raw queries', function () {
      it('should return the postgres modules result', function (done) {
         tiny.query('SELECT * FROM ' + dbName + '.a')
         .then(function (res) {
            expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }, { id: 2, text: 'b' }, { id: 3, text: 'c' }]);
            done();
         })
         .catch(done);
      });
   });
});