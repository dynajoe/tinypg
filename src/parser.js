"use strict";
const T = require("./types");
const _ = require("lodash");
const Fs = require("fs");
const Path = require("path");
const Glob = require('glob');
function parseSql(sql) {
    const validStartChar = /\w/;
    const validChar = /(\w|\.)/;
    const result = [];
    const mapping = [];
    const keys = {};
    let singleLineComment = false;
    let multiLineComment = 0;
    let consumeVar = false;
    let buffer = [];
    let varIdx = 0;
    let inString = false;
    const pushVar = () => {
        const name = buffer.join('');
        if (keys[name]) {
            result.push(`$${keys[name].index}`);
        }
        else {
            varIdx++;
            keys[name] = {
                index: varIdx,
                name: buffer.join(''),
            };
            mapping.push(keys[name]);
            result.push(`$${varIdx}`);
        }
        buffer = [];
        consumeVar = false;
    };
    const pushText = () => {
        result.push(buffer.join(''));
        buffer = [];
    };
    for (let i = 0; i < sql.length; i++) {
        const c = sql[i];
        const n = sql[i + 1];
        const p = sql[i - 1];
        if (!multiLineComment && !singleLineComment && c === '\'' && p !== '\\') {
            inString = !inString;
        }
        else if (!inString && c === '-' && p === '-') {
            singleLineComment = true;
        }
        else if (singleLineComment && c === '\n') {
            singleLineComment = false;
        }
        else if (c === '*' && p === '/') {
            multiLineComment++;
        }
        else if (c === '/' && p === '*') {
            multiLineComment = Math.max(0, multiLineComment - 1);
        }
        if (inString || singleLineComment || multiLineComment > 0) {
            buffer.push(c);
        }
        else {
            if (consumeVar && !validChar.test(c)) {
                pushVar();
            }
            else if (c === ':' && p !== ':' && validStartChar.test(n)) {
                consumeVar = true;
                pushText();
                continue;
            }
            buffer.push(c);
        }
    }
    consumeVar ? pushVar() : pushText();
    return {
        parameterized_sql: result.join(''),
        mapping: mapping,
    };
}
exports.parseSql = parseSql;
function parseFiles(root_directories, path_transformer) {
    const result = _.flatMap(root_directories, (root_dir) => {
        const root_path = Path.resolve(root_dir);
        const glob_pattern = Path.join(root_path, './**/*.sql');
        const files = Glob.sync(glob_pattern);
        return _.map(files, f => {
            const relative_path = f.substring(root_path.length + 1);
            const path = Path.parse(relative_path);
            const file_contents = Fs.readFileSync(f).toString().trim();
            const path_parts = _.map(path.dir.split(Path.sep).concat(path.name), path_transformer);
            const sql_name = path_parts.join('_');
            const sql_key = path_parts.join('.');
            return {
                name: sql_name,
                key: sql_key,
                path: f,
                relative_path,
                text: file_contents,
                path_parts,
                parsed: parseSql(file_contents),
            };
        });
    });
    const conflicts = _.filter(_.groupBy(result, x => x.name), x => x.length > 1);
    if (conflicts.length > 0) {
        const message = `Conflicting sql source paths found (${_.map(conflicts, c => {
            return c[0].relative_path;
        }).join(', ')}). All source files under root dirs must have different relative paths.`;
        throw new T.TinyPgError(message);
    }
    return result;
}
exports.parseFiles = parseFiles;
//# sourceMappingURL=parser.js.map