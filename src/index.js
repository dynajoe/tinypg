"use strict";
var __assign = (this && this.__assign) || Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
    }
    return t;
};
const _ = require("lodash");
const T = require("./types");
const Pg = require("pg");
const P = require("./parser");
const Util = require("./util");
const events_1 = require("events");
const Url = require("url");
const Case = require('case');
const Uuid = require('node-uuid');
const PgFormat = require('pg-format');
const TINYPG_LOG = process.env.TINYPG_LOG === 'true';
Pg.defaults['poolLog'] = TINYPG_LOG ? m => { console.log(`PG: ${m}`); } : _.identity;
class TinyPg {
    constructor(options) {
        this.options = __assign({ snake: false, error_transformer: _.identity, root_dir: [] }, options);
        this.events = new events_1.EventEmitter();
        const params = Url.parse(options.connection_string, true);
        const auth = params.auth.split(':');
        const pool_config = {
            user: auth[0],
            password: auth[1],
            host: params.hostname,
            port: parseInt(params.port, 10),
            database: params.pathname.split('/')[1],
            ssl: params.query.sslmode === 'require',
        };
        this.pool = new Pg.Pool(pool_config);
        const path_transformer = this.options.snake
            ? Case.snake.bind(Case)
            : Case.camel.bind(Case);
        this.sql_files = P.parseFiles([].concat(this.options.root_dir), path_transformer);
        this.sql_db_calls = _.keyBy(_.map(this.sql_files, sql_file => {
            return new DbCall({
                name: sql_file.name,
                key: sql_file.key,
                text: sql_file.text,
                parameterized_query: sql_file.parsed.parameterized_sql,
                parameter_map: sql_file.parsed.mapping,
                prepared: true
            });
        }), x => x.config.key);
    }
    query(raw_sql, params = {}) {
        const stack_trace_accessor = Util.stackTraceAccessor();
        TINYPG_LOG && console.log('TINYPG: query');
        return Promise.resolve()
            .then(() => {
            const parsed = P.parseSql(raw_sql);
            const db_call = new DbCall({
                name: 'raw_query',
                key: null,
                text: raw_sql,
                parameterized_query: parsed.parameterized_sql,
                parameter_map: parsed.mapping,
                prepared: false,
            });
            return this.performDbCall(stack_trace_accessor, db_call, params);
        });
    }
    sql(name, params = {}) {
        const stack_trace_accessor = Util.stackTraceAccessor();
        TINYPG_LOG && console.log('TINYPG: sql', name);
        const db_call = this.sql_db_calls[name];
        if (_.isNil(db_call)) {
            return Promise.reject(new Error(`Sql query with name [${name}] not found!`));
        }
        return this.performDbCall(stack_trace_accessor, db_call, params);
    }
    formattable(name) {
        const db_call = this.sql_db_calls[name];
        if (_.isNil(db_call)) {
            throw new Error(`Sql query with name [${name}] not found!`);
        }
        return new FormattableDbCall(db_call, this);
    }
    transaction(tx_fn) {
        TINYPG_LOG && console.log('TINYPG: transaction');
        return this.getClientContext()
            .then(transaction_context => {
            TINYPG_LOG && console.log('TINYPG: BEGIN transaction');
            return transaction_context.client.query('BEGIN')
                .then(() => {
                const tiny_client_overrides = {
                    release: _.identity,
                };
                const unreleasable_client = _.create(transaction_context, tiny_client_overrides);
                const tiny_overrides = {
                    transaction: f => {
                        TINYPG_LOG && console.log('TINYPG: inner transaction');
                        return f(tiny_tx);
                    },
                    getClientContext: () => {
                        TINYPG_LOG && console.log('TINYPG: getClientContext (transaction)');
                        return Promise.resolve(unreleasable_client);
                    },
                };
                const tiny_tx = _.create(this, tiny_overrides);
                return tx_fn(tiny_tx)
                    .then(result => {
                    TINYPG_LOG && console.log('TINYPG: COMMIT transaction');
                    return transaction_context.client.query('COMMIT')
                        .then(() => {
                        TINYPG_LOG && console.log('TINYPG: release transaction client');
                        transaction_context.release();
                        return result;
                    });
                });
            })
                .catch(error => {
                const releaseAndThrow = () => {
                    TINYPG_LOG && console.log('TINYPG: release transaction client');
                    transaction_context.release();
                    throw error;
                };
                TINYPG_LOG && console.log('TINYPG: ROLLBACK transaction');
                return transaction_context.client.query('ROLLBACK')
                    .then(releaseAndThrow)
                    .catch(releaseAndThrow);
            });
        });
    }
    getClientContext() {
        TINYPG_LOG && console.log('TINYPG: getClient');
        return this.pool.connect()
            .then(client => {
            return {
                client,
                release: client.release.bind(client),
            };
        });
    }
    isolatedEmitter() {
        const tiny_overrides = {
            events: new events_1.EventEmitter(),
        };
        return _.create(TinyPg.prototype, _.extend({
            dispose: function () {
                this.events.removeAllListeners();
            },
        }, this, tiny_overrides));
    }
    performDbCall(stack_trace_accessor, db_call, params) {
        TINYPG_LOG && console.log('TINYPG: performDbCall', db_call.config.name);
        return this.getClientContext()
            .then((client) => {
            const start_at = Date.now();
            const query_context = {
                id: Uuid.v4(),
                sql: db_call.config.parameterized_query,
                start: start_at,
                name: db_call.config.name,
                params,
            };
            this.events.emit('query', query_context);
            const callComplete = (error, data) => {
                client.release();
                const end_at = Date.now();
                _.assign(query_context, {
                    end: end_at,
                    duration: end_at - start_at,
                    error: error,
                    data: data,
                });
                this.events.emit('result', query_context);
            };
            return db_call.execute(client, params)
                .then(result => {
                callComplete(null, result);
                return result;
            })
                .catch(error => {
                callComplete(error, null);
                const tiny_error = new T.TinyPgError(error.message);
                tiny_error.stack = stack_trace_accessor.stack;
                tiny_error.queryContext = query_context;
                throw this.options.error_transformer(tiny_error);
            });
        });
    }
}
exports.TinyPg = TinyPg;
class DbCall {
    constructor(config) {
        this.config = config;
        if (this.config.prepared) {
            this.prepared_name = `${config.name}_${Util.hashCode(config.parameterized_query).toString().replace('-', 'n')}`.substring(0, 63);
        }
    }
    execute(client, params) {
        return Promise.resolve()
            .then(() => {
            TINYPG_LOG && console.log('TINYPG: executing', this.config.name);
            const values = _.map(this.config.parameter_map, m => {
                if (!_.has(params, m.name)) {
                    throw new Error('Missing expected key [' + m.name + '] on input parameters.');
                }
                return _.get(params, m.name);
            });
            const query = this.config.prepared
                ? client.client.query({ name: this.prepared_name, text: this.config.parameterized_query, values })
                : client.client.query(this.config.parameterized_query, values);
            return query
                .then((query_result) => {
                TINYPG_LOG && console.log('TINYPG: execute result', this.config.name);
                return __assign({}, query_result, { rows: query_result.rows });
            });
        });
    }
}
exports.DbCall = DbCall;
class FormattableDbCall {
    constructor(db_call, tiny) {
        this.db = tiny;
        this.db_call = db_call;
    }
    format(...args) {
        const formatted_sql = PgFormat(this.db_call.config.text, ...args);
        const parsed = P.parseSql(formatted_sql);
        const new_db_call = new DbCall(__assign({}, this.db_call.config, { text: formatted_sql, parameterized_query: parsed.parameterized_sql, parameter_map: parsed.mapping }));
        return new FormattableDbCall(new_db_call, this.db);
    }
    query(params = {}) {
        const stack_trace_accessor = Util.stackTraceAccessor();
        return this.db.performDbCall(stack_trace_accessor, this.db_call, params);
    }
}
FormattableDbCall.pg = Pg;
FormattableDbCall.pgDefaults = obj => {
    for (let k in obj) {
        if (obj.hasOwnProperty(k)) {
            Pg.defaults[k] = obj[k];
        }
    }
};
exports.FormattableDbCall = FormattableDbCall;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = TinyPg;
//# sourceMappingURL=index.js.map