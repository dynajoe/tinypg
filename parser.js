var parseSql = function (sql) {
   var consumeVar = false;
   var validChar = /\w/;
   var buffer = [];
   var result = [];
   var mapping = [];
   var varIdx = 0;

   var pushVar = function () {
      varIdx++;
      mapping.push({
         index: varIdx,
         name: buffer.join('')
      });
      result.push("$" + varIdx);
      buffer = [];
      consumeVar = false;
   };

   var pushText = function () {
      result.push(buffer.join(''));
      buffer = [];
   };

   for (var i = 0; i < sql.length; i++) {
      var c = sql[i];
      var n = sql[i + 1];
      var p = sql[i - 1];

      if (consumeVar && !validChar.test(c)) {
         pushVar()
      }
      else if (c === ':' && p !== ':' && validChar.test(n)) {
         consumeVar = true;
         pushText();
         continue;
      }

      buffer.push(c)
   }

   consumeVar ? pushVar() : pushText();

   return {
      transformed: result.join(''),
      mapping: mapping
   }
}

module.exports = {
   parseSql: parseSql
};