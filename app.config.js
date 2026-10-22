
module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const iosUrlScheme = iosClientId
    ? `com.googleusercontent.apps.${iosClientId.replace(/\.apps\.googleusercontent\.com$/, "")}`
    : undefined;

  if (process.env.EAS_BUILD_PLATFORM === "ios" && !iosUrlScheme) {
    throw new Error(
      "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is not set — Google Sign-In would not work on iPhone. Add it to .env (or EAS env) first.",
    );
  }

  const plugins = (config.plugins ?? []).map((p) =>
    p === "@react-native-google-signin/google-signin" && iosUrlScheme
      ? ["@react-native-google-signin/google-signin", { iosUrlScheme }]
      : p,
  );

  return {
    ...config,
    plugins,
    ios: {
      ...config.ios,

      supportsTablet: false,

      config: { ...(config.ios?.config ?? {}), usesNonExemptEncryption: false },
    },
  };
};
