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

describe('Multiple root directories', function () {
   it('should allow specifying multiple directories that do not conflict', function () {
      var tiny = newTiny({
         root_dir: [
            __dirname + '/multi/a_sql',
            __dirname + '/multi/b_sql'
         ]
      });

      expect(tiny.sql.a.insert).to.exist
      expect(tiny.sql.b.insert).to.exist
   });

   it('should error on naming conflict', function () {
      expect(function () {
         newTiny({
            root_dir: [
               __dirname + '/multi/a_sql',
               __dirname + '/sql'
            ]
         });
      }).to.throw(Util.TinyPgError);
   })
});
