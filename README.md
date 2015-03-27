# TinyPg

I liked massive but wanted less. This module allows for one to load SQL files from disk and execute using postgres node module (pg). It also allows for specifying arguments to SQL files using property names.

I created this project to use for my special case. It probably won't work for yours. It also is not very resilient to malformed SQL or variable names that don't match a very simple regex. 

## Usage

```javascript
var Tiny = require('tinypg');

var t = new Tiny({connection_string: "postgres://joe@localhost:5432/mydb?sslmode=disable", files: 'sql/**/*.sql' });

t.db.myQueryFileName({param1: 1, param2: 2})
.then(function () { })
.fail(function () { });
```
