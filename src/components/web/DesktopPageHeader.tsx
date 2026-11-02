import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackHeaderProps } from "@react-navigation/native-stack";
import { colors } from "../../theme/theme";

export const DESKTOP_CONTENT_MAX = 1120;
const pointer: any = { cursor: "pointer" };

export default function DesktopPageHeader({ options, route, navigation, back }: NativeStackHeaderProps) {
  const title = typeof options.title === "string" ? options.title : route.name.replace(/([a-z])([A-Z])/g, "$1 $2");
  const right = options.headerRight?.({ tintColor: colors.primary, canGoBack: !!back });
  return (
    <View style={s.bar}>
      <View style={s.inner}>
        {back ? (
          <Pressable
            onPress={() => navigation.goBack()}
            style={(st: any) => [s.back, pointer, st.hovered && s.backHover]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        <Text style={s.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {right ? <View style={s.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { backgroundColor: colors.background, paddingTop: 24, paddingBottom: 4, paddingHorizontal: 32 },
  inner: { width: "100%", maxWidth: DESKTOP_CONTENT_MAX, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 14 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  backHover: { backgroundColor: colors.surfaceAlt },
  title: { flex: 1, fontSize: 28, fontWeight: "800", letterSpacing: -0.6, color: colors.textPrimary },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
});
