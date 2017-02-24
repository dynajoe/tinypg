"use strict";
function hashCode(str) {
    let hash = 0;
    if (str.length == 0) {
        return hash;
    }
    for (let i = 0, l = str.length; i < l; i++) {
        const ch = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + ch;
        hash |= 0;
    }
    return hash;
}
exports.hashCode = hashCode;
function stackTraceAccessor() {
    const accessor = {};
    const error = new Error();
    Object.defineProperty(accessor, 'stack', {
        get() {
            return error.stack.replace(/\s+at .+\.stackTraceAccessor/, '');
        }
    });
    return accessor;
}
exports.stackTraceAccessor = stackTraceAccessor;
//# sourceMappingURL=util.js.map