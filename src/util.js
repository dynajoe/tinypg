var Q = require('q');

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