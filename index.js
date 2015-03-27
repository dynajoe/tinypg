var Pg = require('pg');
var Q = require('q');
var Glob = require('glob');
var Fs = require('fs');
var Path = require('path');

var Tiny = function (options) {
   this.connString = options.connectionString || options.connection_string;
   var results = parseFiles(options.files);
   this.db = createDbCalls(this, results);
};

Tiny.prototype.connection = function () {
   var d = Q.defer();

   Pg.connect(this.connString, function (err, client, done) {
      if (err) {
         return d.reject(err);
      }

      return d.resolve({ client: client, done: done });
   });

   return d.promise;
};

var createDbCalls = function (db, config) {
   var result = {};

   for (var x in config) {
      var c = config[x];
      var p = Path.parse(c.path);
      var key = p.dir.split(Path.sep).concat(p.name).slice(1);
      setProperty(result, key, dbCall(db, c));
   }

   return result;
};

var dbCall = function (db, config) {
   return function (args) {
      return db.connection().then(function (result) {
         var values = config.mapping.map(function (m) {
            return args[m.name];
         });

         var deferred = Q.defer();

         result.client.query(config.transformed, values, function (err, data) {
            result.done();

            if (err) {
               return deferred.reject(err);
            }

            return deferred.resolve(data);
         });

         return deferred.promise;
      });
   };
};

var setProperty = function (obj, path, value) {
   if (path.length > 1) {
      obj[path[0]] = obj[path[0]] || {};
      return setProperty(obj[path[0]], path.slice(1), value);
   }
   else {
      obj[path[0]] = value;
      return obj;
   }
};

var parseFiles = function (pattern) {
   var files = Glob.sync(pattern);
   var sqlFiles = [];

   for (var i = 0; i < files.length; i++) {
      var f = files[i];

      var data = {
         path: f,
         text: Fs.readFileSync(f).toString(),
         mapping: []
      };

      var match;
      var parts = data.text.split(/(:\w+)/);
      var varIdx = 1;

      var result = parts.reduce(function (curr, next, idx) {
         if (next.indexOf(':') == 0) {
            data.mapping.push({
               name: next.replace(':', ''),
               index: varIdx
            });

            return curr + '$' + (varIdx++);
         }

         return curr + next;
      });

      data.transformed = result;

      sqlFiles.push(data);
   }

   return sqlFiles;
};

module.exports = Tiny;
