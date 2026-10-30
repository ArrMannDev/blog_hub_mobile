import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../metro.config.js", import.meta.url),
  "utf8",
);
const configModule = { exports: {} };
runInNewContext(source, {
  __dirname: process.cwd(),
  module: configModule,
  require: (name) =>
    name === "expo/metro-config"
      ? { getDefaultConfig: () => ({ resolver: {} }) }
      : require(name),
});
const resolve = configModule.exports.resolver.resolveRequest;
const native = {
  type: "sourceFile",
  filePath: path.join(
    process.cwd(),
    "node_modules",
    "react-native",
    "index.js",
  ),
};
const styled = {
  type: "sourceFile",
  filePath: path.join(
    process.cwd(),
    "node_modules",
    "react-native-css",
    "components",
    "index.cjs",
  ),
};

function context(originModulePath) {
  return {
    originModulePath,
    resolveRequest: (_context, moduleName) =>
      moduleName === "react-native-css/components" ? styled : native,
  };
}

for (const platform of ["android", "ios"]) {
  test(`${platform}: Expo assets retain the original React Native AssetRegistry export`, () => {
    for (const origin of [
      "D:\\app\\node_modules\\expo-asset\\build\\Asset.js",
      "/app/node_modules/expo-asset/src/resolveAssetSource.ts",
    ])
      assert.equal(resolve(context(origin), "react-native", platform), native);
  });

  test(`${platform}: app imports still get NativeWind components`, () => {
    assert.equal(
      resolve(
        context(path.join(process.cwd(), "src", "app", "_layout.tsx")),
        "react-native",
        platform,
      ),
      styled,
    );
  });
}

test("web resolution stays with the existing NativeWind resolver", () => {
  assert.equal(
    resolve(
      context("/app/node_modules/expo-asset/build/Asset.js"),
      "react-native",
      "web",
    ),
    native,
  );
});
