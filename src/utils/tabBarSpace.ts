import { useSafeAreaInsets } from "react-native-safe-area-context";

export const TAB_BAR_HEIGHT = 64;

export function tabBarBottom(insetBottom: number): number {
  return insetBottom > 0 ? insetBottom + 8 : 14;
}

export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + tabBarBottom(insets.bottom) + 28;
}
