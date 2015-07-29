var Tiny = require('../src/index')
var Q = require('q');
var Pg = require('pg');
var _ = require('underscore');

var dbSchema = module.exports.dbSchema = 'tiny_test_db';
var connectionString = module.exports.connectionString = 'postgres://joe@localhost:5432/';

var dbQuery = module.exports.dbQuery = function () {
   var args = Array.prototype.slice.call(arguments, 0)
   args[0] = args[0].replace(/\{dbSchema\}/ig, dbSchema);
   var deferred = Q.defer();

   Pg.connect(connectionString, function (err, client, done) {
      if (err) {
         done();
         return deferred.reject(err);
      }

      deferred.resolve({
         client: client,
         done: done
      });
   });

   return deferred.promise.then(function (c) {
      var qDefer = Q.defer();

      c.client.query.apply(c.client, args.concat(function (err, data) {
         c.done();

         if (err) {
            qDefer.reject(err);
         } else {
            qDefer.resolve(data);
         }
      }));

      return qDefer.promise;
   });
};

module.exports.getA = function () {
   return dbQuery('SELECT * FROM {dbSchema}.a');
};

module.exports.insertA = function (text) {
   return dbQuery('INSERT INTO {dbSchema}.a (text) VALUES ($1)', [text]);
};

module.exports.setUpDb = function () {
   var commands = [
      'ROLLBACK;',
      'DROP SCHEMA IF EXISTS {dbSchema} CASCADE;',
      'CREATE SCHEMA {dbSchema};',
      'SET search_path TO {dbSchema};',
      'CREATE TABLE {dbSchema}.a (id serial PRIMARY KEY, text text);'
   ];

   return commands.reduce(function (acc, c) {
      return acc.then(function () {
         return dbQuery(c);
      });
   }, Q());
};

module.exports.newTiny = function (options) {
   return new Tiny(_.extend({
      connectionString: connectionString,
      rootDir: __dirname + '/sql/'
   }, options));
};