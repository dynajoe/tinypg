var Q = require('q');

module.exports.hashCode = function (str) {
   var hash = 0, i, ch;

   if (str.length == 0)
      return hash;

   for (i = 0, l = str.length; i < l; i++) {
     ch = str.charCodeAt(i);
     hash = ((hash << 5) - hash) + ch;
     hash |= 0; // Convert to 32bit integer
   }

   return hash;
};

var setProperty = module.exports.setProperty = function (obj, path, value, transformPath) {
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

module.exports.assertPromise = function (result) {
   if (Q.isPromiseAlike(result)) {
      return result;
   }
   else {
      throw new Error('Expected transaction function to return a promise.');
   }
};

module.exports.TinyPgError = function TinyPgError(message) {
  this.constructor.prototype.__proto__ = Error.prototype;
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
};

module.exports.captureStackTrace = function () {
   var e = new Error();
   Error.captureStackTrace(e, arguments.callee);
   return e.stack;
}
