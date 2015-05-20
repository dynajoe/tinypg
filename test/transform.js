var Parser = require('../src/parser');
var expect = require('chai').expect;

describe('transform', function () {
   var ctx;

   before(function () {
      ctx = {};
      ctx.parsed = Parser.parseSql('SELECT * FROM users where id = :id and name = :name')
   });

   it('should replace the detected variables with postgres variable indexes', function () {
      expect(ctx.parsed.transformed).to.equal('SELECT * FROM users where id = $1 and name = $2')
   });

   it('should return the mapping of postgres vars to names', function () {
      expect(ctx.parsed.mapping).to.deep.equal([
         { name: 'id', index: 1 },
         { name: 'name', index: 2 }
      ])
   });

   describe('type cast vars', function () {
      before(function () {
         ctx = {};
         ctx.parsed = Parser.parseSql('SELECT * FROM users where id = :id::int and name = :name::text')
      });

      it('should replace the detected variables with postgres variable indexes', function () {
         expect(ctx.parsed.transformed).to.equal('SELECT * FROM users where id = $1::int and name = $2::text')
      });

      it('should return the mapping of postgres vars to names', function () {
         expect(ctx.parsed.mapping).to.deep.equal([
            { name: 'id', index: 1 },
            { name: 'name', index: 2 }
         ])
      });
   })
});