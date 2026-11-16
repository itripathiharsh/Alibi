const fs = require("fs");
const path = require("path");

function findBundles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findBundles(fullPath, fileList);
    } else if (entry.name === "index.android.bundle") {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const buildDir = path.resolve(__dirname, "android/app/build");
const foundBundles = findBundles(buildDir);

const explicitPaths = [
  path.resolve(__dirname, "android/app/build/generated/assets/createBundleDebugJsAndAssets/index.android.bundle"),
  path.resolve(__dirname, "android/app/build/intermediates/assets/debug/mergeDebugAssets/index.android.bundle"),
  path.resolve(__dirname, "android/app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle"),
  path.resolve(__dirname, "android/app/build/intermediates/assets/release/mergeReleaseAssets/index.android.bundle"),
];

const allPaths = Array.from(new Set([...foundBundles, ...explicitPaths]));

// Use Babel 7 directly from pnpm store to guarantee 100% stability
const babelCorePath = "D:/alibi/node_modules/.pnpm/@babel+core@7.29.13/node_modules/@babel/core";
const presetEnvPath = "D:/alibi/node_modules/.pnpm/@babel+preset-env@7.29.14_@babel+core@7.29.13/node_modules/@babel/preset-env";

const babel = require(babelCorePath);
const presetEnv = require(presetEnvPath);

const MARKER = "/* ALIBI_JSC_TRANSPILED */";

const JSC_POLYFILLS = `
// ALIBI JavaScriptCore Polyfills for modern ES APIs
(function() {
  var g = typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this;
  if (typeof Object.hasOwn !== 'function') {
    Object.hasOwn = function(object, property) {
      if (object == null) {
        throw new TypeError('Cannot convert undefined or null to object');
      }
      return Object.prototype.hasOwnProperty.call(Object(object), property);
    };
  }
  if (!Array.prototype.at) {
    Array.prototype.at = function(n) {
      n = Math.trunc(n) || 0;
      if (n < 0) n += this.length;
      if (n < 0 || n >= this.length) return undefined;
      return this[n];
    };
  }
  if (!String.prototype.at) {
    String.prototype.at = function(n) {
      n = Math.trunc(n) || 0;
      if (n < 0) n += this.length;
      if (n < 0 || n >= this.length) return undefined;
      return this[n];
    };
  }
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function(searchValue, replaceValue) {
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
    Promise.allSettled = function(promises) {
      return Promise.all(
        Array.from(promises).map(function(item) {
          return Promise.resolve(item).then(
            function(value) { return { status: 'fulfilled', value: value }; },
            function(reason) { return { status: 'rejected', reason: reason }; }
          );
        })
      );
    };
  }
  if (typeof g.AggregateError === 'undefined') {
    function AggregateError(errors, message) {
      var err = new Error(message);
      err.name = 'AggregateError';
      err.errors = errors || [];
      return err;
    }
    g.AggregateError = AggregateError;
  }
})();
`;

for (const bundlePath of allPaths) {
  if (fs.existsSync(bundlePath)) {
    const code = fs.readFileSync(bundlePath, "utf-8");
    if (code.startsWith(MARKER)) {
      console.log(`[transpile_bundle_gradle] Already transpiled, skipping: ${bundlePath}`);
      continue;
    }
    console.log(`[transpile_bundle_gradle] Transpiling bundle: ${bundlePath}`);
    const startTime = Date.now();
    const result = babel.transformSync(code, {
      configFile: false,
      babelrc: false,
      presets: [
        [
          presetEnv,
          {
            targets: { android: "7.0" },
            loose: true,
          },
        ],
      ],
      compact: false,
    });

    let finalCode = MARKER + "\n" + JSC_POLYFILLS + "\n" + result.code;
    const eventCrashNeedle = 'throw Error(\'Unsupported top level event type "\' + e + \'" dispatched\')';
    if (finalCode.indexOf(eventCrashNeedle) !== -1) {
      finalCode = finalCode.replace(eventCrashNeedle, "return null");
      console.log("[transpile_bundle_gradle] Successfully suppressed unsupported top level event crash in extractEvents");
    }

    fs.writeFileSync(bundlePath, finalCode, "utf-8");
    console.log(`[transpile_bundle_gradle] Finished in ${Date.now() - startTime}ms (${finalCode.length} bytes)`);
  }
}
