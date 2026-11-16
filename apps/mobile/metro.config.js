const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react") {
    return {
      filePath: path.resolve(projectRoot, "node_modules/react/index.js"),
      type: "sourceFile",
    };
  }
  if (moduleName === "react/jsx-runtime") {
    return {
      filePath: path.resolve(projectRoot, "node_modules/react/jsx-runtime.js"),
      type: "sourceFile",
    };
  }
  if (moduleName === "react/jsx-dev-runtime") {
    return {
      filePath: path.resolve(projectRoot, "node_modules/react/jsx-dev-runtime.js"),
      type: "sourceFile",
    };
  }
  if (
    moduleName === "react-native/asset-registry" ||
    moduleName === "react-native/Libraries/Image/AssetRegistry"
  ) {
    return {
      filePath: path.resolve(projectRoot, "node_modules/@react-native/assets-registry/registry.js"),
      type: "sourceFile",
    };
  }
  if (moduleName === "react-native/unstable-internals-do-not-use") {
    return {
      filePath: path.resolve(
        projectRoot,
        "node_modules/react-native/Libraries/Image/AssetSourceResolver.js"
      ),
      type: "sourceFile",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
