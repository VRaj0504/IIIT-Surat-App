import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { colors, loadThemePreference } from "./theme/theme";
import ErrorBoundary from "./components/ErrorBoundary";

if (Platform.OS !== "web") SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Boot() {
  const [App, setApp] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    loadThemePreference().finally(() => {
      if (Platform.OS === "web") {
        try {
          document.documentElement.style.backgroundColor = colors.background;
          document.body.style.backgroundColor = colors.background;
        } catch {}
      } else {
        try {
          require("expo-system-ui").setBackgroundColorAsync(colors.background);
        } catch {}
      }
      const Root = require("../App").default as React.ComponentType;
      setApp(() => Root);
    });
  }, []);

  return App ? (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  ) : null;
}
