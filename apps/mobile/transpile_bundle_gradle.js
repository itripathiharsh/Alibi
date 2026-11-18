const fs = require("fs");
const path = require("path");

const variant = process.argv[2];
if (variant !== "Debug" && variant !== "Release") {
  throw new Error("Pass the Android build variant (Debug or Release).");
}

const bundlePath = path.resolve(
  __dirname,
  `android/app/build/generated/assets/createBundle${variant}JsAndAssets/index.android.bundle`
);

function loadPnpmPackage(packageName, majorVersion) {
  const storePath = path.resolve(__dirname, "../../node_modules/.pnpm");
  const packagePrefix = `${packageName.replace("/", "+")}@${majorVersion}.`;
  const candidates = fs
    .readdirSync(storePath)
    .filter((entry) => entry.startsWith(packagePrefix))
    .sort()
    .reverse();

  for (const entry of candidates) {
    const packagePath = path.join(storePath, entry, "node_modules", packageName);
    if (fs.existsSync(packagePath)) return require(packagePath);
  }
  throw new Error(`Could not resolve ${packageName} ${majorVersion}.x from the pnpm store.`);
}

const babel = loadPnpmPackage("@babel/core", 7);
const presetEnv = loadPnpmPackage("@babel/preset-env", 7);

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

if (fs.existsSync(bundlePath)) {
  const code = fs.readFileSync(bundlePath, "utf-8");
  if (code.startsWith(MARKER)) {
    console.log(`[transpile_bundle_gradle] Already transpiled, skipping: ${bundlePath}`);
  } else {
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
} else {
  throw new Error(`Bundle for ${variant} was not found: ${bundlePath}`);
}
