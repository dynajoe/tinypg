var Fs = require('fs');
var Glob = require('glob');
var Path = require('path');
var _ = require('lodash');
var TinyPgError = require('./util').TinyPgError;

var parseSql = function (sql) {
   var consumeVar = false;
   var inString = false;
   var validStartChar = /\w/;
   var validChar = /(\w|\.)/;
   var buffer = [];
   var result = [];
   var mapping = [];
   var keys = {};
   var varIdx = 0;
   var singleLineComment = false;
   var multiLineComment = 0;

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

      if (singleLineComment || multiLineComment > 0) {
         // do nothing while in comment
      }
      else if (consumeVar && !validChar.test(c)) {
         pushVar()
      }
      else if (c === ':' && p !== ':' && validStartChar.test(n) && !inString) {
         consumeVar = true;
         pushText();
         continue;
      } else if (c === '\'' && p !== '\\') {
         inString = !inString;
      } else if (c === '-' && p === '-') {
         singleLineComment = true
      } else if (singleLineComment && c === '\n') {
         singleLineComment = false
      } else if (c === '*' && p === '/') {
         multiLineComment++
      } else if (c === '/' && p === '*') {
         multiLineComment = Math.max(0, multiLineComment - 1)
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
   var rootDirs = [].concat(rootDir)

   var result = _.flatMap(rootDirs, function (d) {
      var root = Path.resolve(d);
      var searchPath = Path.join(root, './**/*.sql');
      var files = Glob.sync(searchPath);
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
   });

   var conflicts = _.chain(result)
   .groupBy('name')
   .filter(function (x) {
      return x.length > 1
   })
   .value()

   if (conflicts.length > 0) {
      var message = "Conflicting sql source paths found (" + conflicts.map(function (c) {
         return c[0].relative_path
      }).join(', ') + "). All source files under root dirs must have different relative paths."

      throw new TinyPgError(message);
   }

   return result;
};

module.exports = {
   parseSql: parseSql,
   parseFiles: parseFiles
};
