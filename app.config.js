// Extends app.json with values that come from environment variables
// (.env locally, or EAS environment variables for cloud builds).
//
// Google Sign-In on iPhone needs the iOS OAuth client from Google Cloud:
//   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=1234-abcd.apps.googleusercontent.com
// Its "reversed" form becomes the URL scheme Google redirects back to.
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
      // iPhone only — avoids iPad screenshots and iPad review.
      supportsTablet: false,
      // Only standard HTTPS — so App Store Connect doesn't ask about export compliance on every build.
      config: { ...(config.ios?.config ?? {}), usesNonExemptEncryption: false },
    },
  };
};
