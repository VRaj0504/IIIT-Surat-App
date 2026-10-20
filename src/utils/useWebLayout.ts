import { Platform, useWindowDimensions } from "react-native";

// Below this width the web build keeps the phone layout (bottom tabs, no
// website header); at or above it the website layout takes over.
export const DESKTOP_BREAKPOINT = 900;

export function useWebLayout() {
  const { width } = useWindowDimensions();
  return {
    isWeb: Platform.OS === "web",
    isDesktop: Platform.OS === "web" && width >= DESKTOP_BREAKPOINT,
    width,
  };
}
