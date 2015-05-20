var Fs = require('fs');
var Glob = require('glob');
var Path = require('path');

var parseSql = function (sql) {
   var consumeVar = false;
   var validChar = /\w/;
   var buffer = [];
   var result = [];
   var mapping = [];
   var keys = {};
   var varIdx = 0;

   var pushVar = function () {
      var name = buffer.join('');

      if (keys[name]) {
         result.push("$" + keys[name].index);
      } else {
         varIdx++;
         keys[name] = {
            index: varIdx,
            name: buffer.join('')
         };
         mapping.push(keys[name]);
         result.push("$" + varIdx);
      }

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
};

var parseFiles = function (rootDir) {
   var root = Path.resolve(rootDir);
   var files = Glob.sync(Path.join(root, './**/*.sql'));
   var sqlFiles = [];

   for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var relative_path = f.substring(root.length);

      var data = {
         name: relative_path.replace(/\W/ig, '_').replace('_', ''),
         path: f,
         relative_path: relative_path,
         text: Fs.readFileSync(f).toString()
      };

      var result = parseSql(data.text);
      data.transformed = result.transformed;
      data.mapping = result.mapping;

      sqlFiles.push(data);
   }

   return sqlFiles;
};

module.exports = {
   parseSql: parseSql,
   parseFiles: parseFiles
};