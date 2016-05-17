var Tiny = require('../src/index');
var Q = require('q');
var Pg = require('pg');
var Util = require('../src/util');
var expect = require('chai').expect;
var setUpDb = require('./helper').setUpDb;
var insertA = require('./helper').insertA;
var newTiny = require('./helper').newTiny;
var dbSchema = require('./helper').dbSchema;
var connectionString = require('./helper').connectionString;

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

            it('should isolate if asked', function () {
               var iso = tiny.isolatedEmitter();

               var onQueryDataA, onResultDataA,
                   onQueryDataB, onResultDataB;

               tiny.events.on('query', function (e) {
                  onQueryDataA = e;
               });

               tiny.events.on('result', function (e) {
                  onResultDataA = e;
               });

               iso.events.on('query', function (e) {
                  onQueryDataB = e;
               });

               iso.events.on('result', function (e) {
                  onResultDataB = e;
               });

               return iso.sql.a.select()
               .then(function (res) {
                  expect(onQueryDataA).to.not.exist
                  expect(onResultDataA).to.not.exist

                  expect(onQueryDataB).to.exist
                  expect(onResultDataB).to.exist

                  iso.dispose();

                  tiny.events.removeAllListeners();

                  expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }, { id: 2, text: 'b' }, { id: 3, text: 'c' }]);
               });
            });

            it('should emit events', function () {
               var onQueryData, onResultData;

               tiny.events.on('query', function (e) {
                  onQueryData = e;
               });

               tiny.events.on('result', function (e) {
                  onResultData = e;
               });

               return tiny.sql.a.select()
               .then(function (res) {
                  expect(onQueryData).not.to.be.null
                  expect(onResultData).not.to.be.null

                  tiny.events.removeAllListeners();

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

            describe('that have nested parameters', function () {
               it('should perform the replacements', function () {
                  return tiny.sql.a.testNested({
                     a: {
                        foo: 'a'
                     }
                  })
                  .then(function (res) {
                     expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }]);
                  });
               });
            });

            describe('that have missing parameters', function () {
               it('should perform the replacements', function () {
                  return tiny.sql.a.testMissingParams({
                     a: 'a'
                  })
                  .catch(function (err) {
                     expect(err).to.be.instanceof(Util.TinyPgError);
                     expect(err).to.have.property('queryContext');
                     expect(err.message).to.include('this_is_the_missing_param');
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
            });

            describe('that throws an error', function () {
               it('should wrap the error with the queryContext', function () {
                  return tiny.sql.a.queryWithError()
                  .catch(function (err) {
                     expect(err).to.be.instanceof(Util.TinyPgError);
                     expect(err).to.have.property('queryContext');
                     expect(err.queryContext).to.not.have.property('context');
                     expect(err.message).to.include('blah_doesnt_exist');
                  });
               });

               it('should have the correct stack trace', function () {
                  var thisShouldBeInStack = function () {
                     return tiny.sql.a.queryWithError()
                     .catch(function (err) {
                        expect(err.stack).to.include('queryWithError');
                        expect(err.stack).to.include('thisShouldBeInStack');
                     });
                  }

                  return thisShouldBeInStack();
               });
            });
         });

         describe('Raw queries', function () {
            it('should return the postgres modules result', function () {
               return tiny.query('SELECT * FROM ' + dbSchema + '.a')
               .then(function (res) {
                  expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }, { id: 2, text: 'b' }, { id: 3, text: 'c' }]);
               });
            });

            describe('When an error is thrown', function () {
               it('should have appropriate metadata', function () {
                  return tiny.query('SELECT THIS_WILL_THROW_ERROR;')
                  .catch(function (err) {
                     expect(err).to.be.instanceof(Util.TinyPgError);
                     expect(err).to.have.property('queryContext');
                     expect(err.queryContext).to.not.have.property('context');
                     expect(err.message).to.include('does not exist');
                  });
               })

               it('should have the correct stack trace', function () {
                  var thisShouldBeInStack = function () {
                     return tiny.query('SELECT THIS_WILL_THROW_ERROR;')
                     .catch(function (err) {
                        expect(err.stack).to.include('thisShouldBeInStack');
                     });
                  }

                  return thisShouldBeInStack();
               });
            });
         });
      });
   };

   tests('Raw Statements');

   tests('Prepared Statements', { prepared: true });

   it('should allow creating an instance of tiny without directory', function () {
      var tiny = new Tiny({
         connectionString: connectionString
      });

      return tiny.query('SELECT 1 as x')
      .then(function (res) {
         expect(res.rows).to.deep.equal([{ x: 1 }]);
      })
   });

   it('should transform errors', function () {
      var expectedError = { foo: 'bar' };

      var tiny = new Tiny({
         connectionString: connectionString,
         error_transformer: function (err) {
            return expectedError;
         }
      });

      return tiny.query('SELECT THIS_WILL_THROW_ERROR;')
      .catch(function (err) {
         expect(err).to.deep.equal(expectedError);
      });
   });

   it('should transform results', function () {
      var expectedResults = { baz: 'bar' };

      var tiny = new Tiny({
         connectionString: connectionString,
         result_transformer: function (results) {
            return expectedResults;
         }
      });

      return tiny.query('SELECT 1;')
      .then(function (res) {
         expect(res).to.deep.equal(expectedResults);
      });
   });
});
