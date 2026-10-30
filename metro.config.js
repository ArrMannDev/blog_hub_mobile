const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = withNativewind(getDefaultConfig(__dirname));
const resolveWithNativewind = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // NativeWind's current wrapper omits the AssetRegistry export used by Expo 58.
  if (
    platform !== "web" &&
    moduleName === "react-native" &&
    context.originModulePath
      .replaceAll("\\", "/")
      .includes("/node_modules/expo-asset/")
  ) {
    return context.resolveRequest(context, moduleName, platform);
  }
  return resolveWithNativewind(context, moduleName, platform);
};

module.exports = config;
