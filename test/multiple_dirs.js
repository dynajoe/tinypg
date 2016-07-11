var Util = require('../src/util');
var expect = require('chai').expect;
var newTiny = require('./helper').newTiny;

describe('Multiple root directories', function () {
   it('should allow specifying multiple directories that do not conflict', function () {
      var tiny = newTiny({
         root_dir: [
            __dirname + '/multi/a_sql',
            __dirname + '/multi/b_sql',
         ],
      });

      expect(tiny.sql.a.insert).to.exist;
      expect(tiny.sql.b.insert).to.exist;
   });

   it('should error on naming conflict', function () {
      expect(function () {
         newTiny({
            root_dir: [
               __dirname + '/multi/a_sql',
               __dirname + '/sql',
            ],
         });
      }).to.throw(Util.TinyPgError);
   });
});
