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
    fs.writeFileSync(bundlePath, MARKER + "\n" + result.code, "utf-8");
    console.log(`[transpile_bundle_gradle] Finished in ${Date.now() - startTime}ms (${result.code.length} bytes)`);
  }
}
