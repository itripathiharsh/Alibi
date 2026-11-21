const path = require("path");
const { execFileSync } = require("child_process");

function toWslPath(filePath) {
  if (!filePath || filePath.startsWith("-")) return filePath;
  const abs = path.resolve(process.cwd(), filePath);
  const drive = abs[0].toLowerCase();
  return `/mnt/${drive}/${abs.slice(3).replace(/\\/g, "/")}`;
}

const reactNativeDir = path.dirname(require.resolve("react-native/package.json"));
const hermesLinuxPath = toWslPath(
  path.join(reactNativeDir, "sdks/hermesc/linux64-bin/hermesc")
);

const rawArgs = process.argv.slice(2);
const convertedArgs = [];

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === "-out" && i + 1 < rawArgs.length) {
    convertedArgs.push("-out");
    convertedArgs.push(toWslPath(rawArgs[++i]));
  } else if (!arg.startsWith("-")) {
    convertedArgs.push(toWslPath(arg));
  } else {
    convertedArgs.push(arg);
  }
}

try {
  execFileSync("wsl", [hermesLinuxPath, ...convertedArgs], { stdio: "inherit" });
  process.exit(0);
} catch (err) {
  process.exit(err.status || 1);
}
