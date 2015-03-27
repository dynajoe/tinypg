var Pg = require('pg');
var Q = require('q');
var Glob = require('glob');
var Fs = require('fs');
var Path = require('path');
var Case = require('case');

var Tiny = function (pg, options) {
   this.connString = options.connectionString || options.connection_string;
   var results = parseFiles(options.root_dir || options.rootDir);
   this.sql = createDbCalls(this, results, (options.snake ? Case.snake : Case.camel).bind(Case));
   this.Pg = Pg;
};

Tiny.pg = pg;

Tiny.pgDefaults = function (obj) {
   for (var k in obj) {
      if (obj.hasOwnProperty(k)) {
         Pg.defaults[k] = obj[k];
      }
   }
};

Tiny.prototype.getClient = function () {
   var d = Q.defer();

   Pg.connect(this.connString, function (err, client, done) {
      if (err) {
         return d.reject(err);
      }

      return d.resolve({ client: client, done: done });
   });

   return d.promise;
};

var createDbCalls = function (db, callConfigs, transformPath) {
   var result = {};

   for (var x in callConfigs) {
      var c = callConfigs[x];
      var p = Path.parse(c.relative_path);
      var key = p.dir.split(Path.sep).concat(p.name).slice(1);
      setProperty(result, key, dbCall(db, c), transformPath);
   }

   return result;
};

var dbCall = function (db, config) {
   return function (args) {
      return db.getClient().then(function (result) {
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

var setProperty = function (obj, path, value, transformPath) {
   if (path[0] == null || path[0].trim() == '') {
      return setProperty(obj, path.slice(1), value, transformPath);
   }

   var pathPart = transformPath(path[0]);

   if (path.length > 1) {
      obj[pathPart] = obj[pathPart] || {};
      return setProperty(obj[pathPart], path.slice(1), value, transformPath);
   }
   else {
      obj[pathPart] = value;
      return obj;
   }
};

var parseFiles = function (rootDir) {
   var root = Path.resolve(rootDir);
   var files = Glob.sync(Path.join(root, './**/*.sql'));
   var sqlFiles = [];

   for (var i = 0; i < files.length; i++) {
      var f = files[i];

      var data = {
         path: f,
         relative_path: f.substring(root.length),
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
