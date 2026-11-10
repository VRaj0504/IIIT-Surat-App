import React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/theme";
import { useOnline } from "../hooks/useOnline";

/** A small pill near the bottom of the screen while there is no internet. It doesn't block touches. */
export default function OfflineBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", bottom: insets.bottom + 96, left: 0, right: 0, alignItems: "center", zIndex: 1000 }}>
      <View
        accessibilityRole="alert"
        style={{
          backgroundColor: colors.warningBg,
          borderColor: colors.warning,
          borderWidth: 1,
          borderRadius: 999,
          paddingVertical: 6,
          paddingHorizontal: 14,
        }}
      >
        <Text style={{ color: colors.warningText, fontSize: 13, fontWeight: "600" }}>You're offline. Showing saved data.</Text>
      </View>
    </View>
  );
}
