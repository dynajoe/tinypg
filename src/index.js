var Pg = require('pg');
var Q = require('q');
var Glob = require('glob');
var Fs = require('fs');
var Path = require('path');
var Case = require('case');
var Parser = require('./parser');
var _ = require('underscore');

var setSql = function (db) {
   var transformPath = (db.options.snake ? Case.snake : Case.camel).bind(Case);
   var sqlObj = {};

   for (var x in db.callConfigs) {
      var config = db.callConfigs[x];
      var p = Path.parse(config.relative_path);
      var key = p.dir.split(Path.sep).concat(p.name).slice(1);
      var callFn = createDbCallFn(db.getClient.bind(db), config);

      setProperty(sqlObj, key, callFn, transformPath);
   }

   db.sql = sqlObj;
};

var dbCall = function (clientCtx, config) {
   return function (params) {
      var values = config.mapping.map(function (m) {
         return params[m.name];
      });

      var deferred = Q.defer();

      clientCtx.client.query(config.transformed, values, function (err, data) {
         clientCtx.done();
         err ? deferred.reject(err) : deferred.resolve(data);
      });

      return deferred.promise;
   };
};

var createDbCallFn = function (getClient, config) {
   return function (params) {
      return getClient().then(function (clientCtx) {
         return dbCall(clientCtx, config)(params);
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

var assertPromise = function (result) {
   if (Q.isPromiseAlike(result)) {
      return result;
   }
   else {
      throw new Error('Expected transaction function to return a promise.');
   }
};

var Tiny = function (options) {
   this.pg = Pg;

   this.options = _.extend({
      snake: false,
      connString: options.connectionString || options.connection_string,
      rootDir: options.root_dir || options.rootDir
   }, options);

   this.callConfigs = Parser.parseFiles(this.options.rootDir);
   this.connect = Q.nbind(Pg.connect, Pg);

   setSql(this);
};

// Static
Tiny.pg = Pg;

Tiny.pgDefaults = function (obj) {
   for (var k in obj) {
      if (obj.hasOwnProperty(k)) {
         Pg.defaults[k] = obj[k];
      }
   }
};

// Instance
Tiny.prototype.query = function (query, params) {
   var parsedSql = Parser.parseSql(query);
   var clientDone;

   return this.getClient()
   .then(function (clientCtx) {
      clientDone = clientCtx.done;
      return dbCall(clientCtx, parsedSql)(params);
   })
   .then(function (res) {
      clientDone();
      return res;
   });
};

Tiny.prototype.getClient = function () {
   return this.connect(this.options.connString)
   .spread(function (client, done) {
      return {
         client: client,
         done: done
      };
   });
};

Tiny.prototype.transaction = function (txFn) {
   var pgClient, clientDone,
      clientQuery, _this = this,
      txDone = false;

   return this.getClient()
   .then(function (clientCtx) {
      pgClient = clientCtx.client;
      clientDone = clientCtx.done;
      clientQuery = Q.nbind(pgClient.query, pgClient);
      return clientQuery('BEGIN');
   })
   .then(function (res) {
      // Create a new version of this instance of Tiny
      // with getClient overridden to provide same client
      var tinyOverride = _.create(_this, {
         transaction: function(txFn) {
            return assertPromise(txFn(tinyOverride));
         },
         getClient: Q.fbind(function () {
            if (txDone) {
               throw new Error('Transaction has already completed for this client!');
            }

            return {
               client: pgClient,
               // done: Can be called several times
               done: function () {}
            };
         })
      });

      // This really sucks, expensive operation
      setSql(tinyOverride);

      return assertPromise(txFn(tinyOverride));
   })
   .then(function (result) {
      return clientQuery('COMMIT')
      .then(function () {
         return result;
      });
   })
   .catch(function (err) {
      var throwErr = function () {
         throw err;
      };

      if (clientQuery) {
         return clientQuery('ROLLBACK').fin(throwErr);
      }
      else {
         throw err;
      }
   })
   .fin(function () {
      txDone = true;

      if (clientDone) {
         clientDone();
      }
   });
};

module.exports = Tiny;
