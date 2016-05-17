var Pg = require('pg');
var Q = require('q');
var Path = require('path');
var Case = require('case');
var Parser = require('./parser');
var _ = require('lodash');
var PgFormat = require('pg-format');
var Util = require('./util');
var Uuid = require('node-uuid');
var EventEmitter = require('events').EventEmitter;

var setSql = function (db) {
   var transformPath = (db.options.snake ? Case.snake : Case.camel).bind(Case);
   var sqlObj = {};

   for (var x in db.callConfigs) {
      var config = db.callConfigs[x];
      var p = Path.parse(config.relative_path);
      var key = p.dir.split(Path.sep).concat(p.name).slice(1);
      config.prepared = db.options.prepared;

      var callFn = createDbCallFn(db.getClient.bind(db), config);

      Util.setProperty(sqlObj, key, callFn, transformPath);
   }

   db.sql = sqlObj;
};

var dbCall = function (clientCtx, config) {
   return function (inputParams) {
      var values = config.mapping.map(function (m) {
         if (!_.has(inputParams, m.name)) {
            throw new Error('Missing expected key [' + m.name + '] on input parameters.')
         }
         return _.get(inputParams, m.name);
      });

      var deferred = Q.defer();
      var name = (config.name ? config.name + '_' : '') + Util.hashCode(config.transformed).toString().replace('-', 'n');
      var params;

      if (config.prepared) {
         params = [{
            name: name,
            text: config.transformed,
            values: values
         }];
      } else {
         params = [
            config.transformed,
            values
         ];
      }

      var startTime = process.hrtime();

      var queryContext = {
         id: Uuid.v4(),
         name: name,
         sql: config.transformed,
         start: new Date().getTime(),
         values: values,
         context: clientCtx
      };

      clientCtx.db.events.emit('query', queryContext);

      clientCtx.client.query.apply(clientCtx.client, params.concat(function (err, data) {
         var now = new Date().getTime();
         var context = _.extend(queryContext, {
            end: now,
            duration: now - queryContext.start
         });

         clientCtx.db.events.emit('result', _.extend(context, {
            error: err,
            data: data
         }));

         if (err) {
            var e = new Util.TinyPgError();
            e.message = err.message;
            e.queryContext = _.omit(context, 'context');;
            e.stack = err.stack;

            var transformed = clientCtx.db.options.error_transformer(e)
            return deferred.reject(transformed);
         }

         data = clientCtx.db.options.result_transformer(data)
         deferred.resolve(data);
      }));

      return deferred.promise;
   };
};

var formatFn = function (config, getClient) {
   return function () {
      var args = [config.text].concat(Array.prototype.slice.call(arguments, 0));
      var result = PgFormat.apply(PgFormat, args);
      var parsed = Parser.parseSql(result);

      var newConfig = _.extend({}, config, {
         text: result,
         transformed: parsed.transformed,
         mapping: parsed.mapping
      });

      return {
         format: formatFn(newConfig, getClient),
         query: createDbCallFn(getClient, newConfig)
      };
   };
};

var createDbCallFn = function (getClient, config) {
   var fn = function (params) {
      var stack_trace_error = new Error();
      Error.captureStackTrace(stack_trace_error, arguments.callee);
      var stack_trace = stack_trace_error.stack;

      return getClient()
      .then(function (clientCtx) {
         return dbCall(clientCtx, config)(params)
         .fin(function () {
            clientCtx.done();
         });
      })
      .catch(function (err) {
         err.stack = stack_trace;
         throw err;
      });
   };

   fn.text = config.text;
   fn.transformed = config.transformed;
   fn.format = formatFn(config, getClient);

   return fn;
};

var Tiny = function (options) {
   this.pg = Pg;

   this.options = _.extend({
      snake: false,
      error_transformer: function(err) {
         return e;
      },
      result_transformer: _.identity,
   }, options);

   this.connect = Q.nbind(Pg.connect, Pg);
   this.format = PgFormat;
   this.events = new EventEmitter();

   if (this.options.root_dir) {
      this.callConfigs = Parser.parseFiles(this.options.root_dir);
      setSql(this);
   }
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

Tiny.prototype.isolatedEmitter = function () {
   var res = _.create(Tiny.prototype, _.extend({}, this, {
      events: new EventEmitter(),
      dispose: function () {
         this.events.removeAllListeners()
      }
   }));

   setSql(res);

   return res
}

// Instance
Tiny.prototype.query = function (query, params) {
   var parsedSql = Parser.parseSql(query);

   return this.getClient()
   .then(function (clientCtx) {
      return dbCall(clientCtx, parsedSql)(params)
      .fin(function () {
         clientCtx.done();
      });
   });
};

Tiny.prototype.getClient = function () {
   var tiny = this;

   return this.connect(this.options.connection_string)
   .spread(function (client, done) {
      return {
         client: client,
         done: done,
         db: tiny
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
            return Util.assertPromise(txFn(tinyOverride));
         },
         getClient: Q.fbind(function () {
            if (txDone) {
               throw new Error('Transaction has already completed for this client!');
            }

            return {
               client: pgClient,
               db: tinyOverride,
               // done: Can be called several times
               done: function () {}
            };
         })
      });

      setSql(tinyOverride);

      return Util.assertPromise(txFn(tinyOverride));
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
