// JavaScriptCore Polyfills for ES2022+ APIs on Android
if (typeof Object.hasOwn !== 'function') {
  Object.hasOwn = function (object, property) {
    if (object == null) {
      throw new TypeError('Cannot convert undefined or null to object');
    }
    return Object.prototype.hasOwnProperty.call(Object(object), property);
  };
}

if (!Array.prototype.at) {
  Array.prototype.at = function (n) {
    n = Math.trunc(n) || 0;
    if (n < 0) n += this.length;
    if (n < 0 || n >= this.length) return undefined;
    return this[n];
  };
}

if (!String.prototype.at) {
  String.prototype.at = function (n) {
    n = Math.trunc(n) || 0;
    if (n < 0) n += this.length;
    if (n < 0 || n >= this.length) return undefined;
    return this[n];
  };
}

if (!String.prototype.replaceAll) {
  String.prototype.replaceAll = function (searchValue, replaceValue) {
    if (searchValue instanceof RegExp) {
      if (!searchValue.global) {
        throw new TypeError('String.prototype.replaceAll called with a non-global RegExp argument');
      }
      return this.replace(searchValue, replaceValue);
    }
    return this.split(searchValue).join(replaceValue);
  };
}

if (!Promise.allSettled) {
  Promise.allSettled = function (promises) {
    return Promise.all(
      Array.from(promises).map(function (item) {
        return Promise.resolve(item).then(
          function (value) { return { status: 'fulfilled', value: value }; },
          function (reason) { return { status: 'rejected', reason: reason }; }
        );
      })
    );
  };
}

if (!Array.prototype.findLastIndex) {
  Array.prototype.findLastIndex = function (predicate, thisArg) {
    if (this == null) {
      throw new TypeError('Array.prototype.findLastIndex called on null or undefined');
    }
    if (typeof predicate !== 'function') {
      throw new TypeError('predicate must be a function');
    }
    var list = Object(this);
    var length = Number(list.length) || 0;
    for (var i = length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, list[i], i, list)) {
        return i;
      }
    }
    return -1;
  };
}

if (!Array.prototype.findLast) {
  Array.prototype.findLast = function (predicate, thisArg) {
    if (this == null) {
      throw new TypeError('Array.prototype.findLast called on null or undefined');
    }
    if (typeof predicate !== 'function') {
      throw new TypeError('predicate must be a function');
    }
    var list = Object(this);
    var length = Number(list.length) || 0;
    for (var i = length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, list[i], i, list)) {
        return list[i];
      }
    }
    return undefined;
  };
}

if (!Array.prototype.toReversed) {
  Array.prototype.toReversed = function () {
    return Array.from(this).reverse();
  };
}

if (!Array.prototype.toSorted) {
  Array.prototype.toSorted = function (compareFn) {
    return Array.from(this).sort(compareFn);
  };
}

if (typeof globalThis.AggregateError === 'undefined') {
  function AggregateError(errors, message) {
    var err = new Error(message);
    err.name = 'AggregateError';
    err.errors = errors || [];
    return err;
  }
  globalThis.AggregateError = AggregateError;
}

