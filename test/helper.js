var Tiny = require('../src/index')
var Q = require('q');
var Pg = require('pg');

var dbName = 'tiny_test_db';
var connectionString = 'postgres://joe@localhost:5432/';

var getA = function () {
   var deferred = Q.defer();

   Pg.connect(connectionString, function (err, client, done) {
      if (err) {
         done();
         return deferred.reject(err);
      }

      client.query('SELECT * FROM a', function (err, data) {
         done();

         if (err) {
            return deferred.reject(err);
         }

         deferred.resolve(data);
      });
   });

   return deferred.promise;
};

var insertA = function (text) {
   var deferred = Q.defer();

   Pg.connect(connectionString, function (err, client, done) {
      if (err) {
         done();
         return deferred.reject(err);
      }

      client.query('INSERT INTO ' + dbName + '.a (text) VALUES ($1)', [text], function (err, data) {
         done();

         if (err) {
            return deferred.reject(err);
         }

         deferred.resolve(data);
      });
   });

   return deferred.promise;
};

var setUpDb = function (cb) {
   var commands = [
      'ROLLBACK',
      'DROP SCHEMA IF EXISTS ' + dbName + ' cascade ',
      'SET search_path TO ' + dbName,
      'CREATE SCHEMA ' + dbName,
      'CREATE TABLE '+ dbName +'.a (id serial PRIMARY KEY, text text);'
   ];

   Pg.connect(connectionString, function (err, client, done) {
      if (err) {
         done();
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
      })
      .catch(function (err) {
         done();
         cb(err);
      });
   });
};

var newTiny = function () {
   return new Tiny({
      connectionString: connectionString,
      rootDir: __dirname + '/sql/'
   });
};

module.exports = {
   dbName: dbName,
   setUpDb: setUpDb,
   insertA: insertA,
   getA: getA,
   newTiny: newTiny
};