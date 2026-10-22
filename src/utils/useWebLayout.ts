import { Platform, useWindowDimensions } from "react-native";

export const DESKTOP_BREAKPOINT = 900;

export function useWebLayout() {
  const { width } = useWindowDimensions();
  return {
    isWeb: Platform.OS === "web",
    isDesktop: Platform.OS === "web" && width >= DESKTOP_BREAKPOINT,
    width,
  };
}
