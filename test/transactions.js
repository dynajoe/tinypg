var Tiny = require('../src/index')
var Q = require('q');
var Pg = require('pg');
var expect = require('chai').expect;

var dbName = 'tiny_test_db';
var connectionString = 'postgres://joe@localhost:5432/';

var setUpDb = function (cb) {
   var commands = [
      'DROP SCHEMA IF EXISTS ' + dbName + ' cascade ',
      'SET search_path TO ' + dbName,
      'CREATE SCHEMA ' + dbName,
      'CREATE TABLE '+ dbName +'.a (id BIGSERIAL PRIMARY KEY, text text);'
   ];

   Pg.connect(connectionString, function (err, client, done) {
      if (err) {
         return cb(err);
      }

      commands.reduce(function (acc, c) {
         return acc.then(function () {
            return Q.nbind(client.query, client)(c);
         });
      }, Q())
      .then(function () {
         done();
         cb();
      });
   });
};

var getA = function () {
   var deferred = Q.defer();

   Pg.connect(connectionString, function (err, client, done) {
      if (err) {
         return deferred.reject(err);
      }

      client.query('SELECT * FROM a', function (err, data) {
         if (err) {
            return deferred.reject(err);
         }
         deferred.resolve(data);
      });
   });

   return deferred.promise;
};

describe('Transactions', function () {
   var tiny;

   beforeEach(function (done) {
      setUpDb(function (err) {
         if (err) {
            return done(err);
         }

         tiny = new Tiny({
            connectionString: connectionString,
            rootDir: __dirname + '/sql/'
         });

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
            return ctx.query('INSERT INTO a (text) VALUES (:text)', {
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
            return ctx.query('INSERT INTO a (text) VALUES (:text)', {
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