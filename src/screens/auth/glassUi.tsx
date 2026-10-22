import React, { createContext, useContext, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StyleSheet,
  useWindowDimensions,
  type TextInputProps,
} from "react-native";
import { BlurView, BlurTargetView } from "expo-blur";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

export const BG = "#F3F5F9";
export const TEXT = "#0E1A33";
export const MUTED = "#5B6478";
export const FAINT = "#8A93A6";
export const ACCENT = "#0B3D91";
export const MINT = "#2BB8A3";
export const EASE = Easing.out(Easing.cubic);

const BLUR_METHOD = "dimezisBlurViewSdk31Plus" as const;

export const tick = () => Haptics.selectionAsync().catch(() => {});

const BgRef = createContext<React.RefObject<View | null> | null>(null);

function Blob({ size, color, x, y, dx, dy, duration }: { size: number; color: string; x: number; y: number; dx: number; dy: number; duration: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * dx }, { translateY: t.value * dy }, { scale: 1 + t.value * 0.1 }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", left: x, top: y, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, a]}
    />
  );
}

export function GlassScreen({ children }: { children: React.ReactNode }) {
  const bg = useRef<View>(null);
  const { width, height } = useWindowDimensions();
  return (
    <BgRef.Provider value={bg}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar style="dark" />
        <BlurTargetView ref={bg} style={StyleSheet.absoluteFill}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: BG }]} />
          <Blob size={width * 0.95} color="rgba(59,130,246,0.28)" x={-width * 0.35} y={-height * 0.1} dx={40} dy={30} duration={12000} />
          <Blob size={width * 0.8} color="rgba(167,139,250,0.26)" x={width * 0.45} y={height * 0.16} dx={-36} dy={34} duration={14000} />
          <Blob size={width * 0.75} color="rgba(94,234,212,0.26)" x={-width * 0.15} y={height * 0.6} dx={30} dy={-26} duration={13000} />
        </BlurTargetView>
        <BlurView intensity={90} tint="light" blurTarget={bg} blurMethod={BLUR_METHOD} style={StyleSheet.absoluteFill} pointerEvents="none" />
        {children}
      </View>
    </BgRef.Provider>
  );
}

export function Reveal({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: any }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withTiming(1, { duration: 700, easing: EASE }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const a = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 14 }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

export function Glass({ style, children, radius = 24 }: { style?: any; children: React.ReactNode; radius?: number }) {
  const bg = useContext(BgRef);
  return (
    <View style={[st.glassShadow, { borderRadius: radius }, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
        <BlurView intensity={40} tint="light" blurTarget={bg ?? undefined} blurMethod={BLUR_METHOD} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.62)" }]} />
      </View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: "rgba(255,255,255,0.95)" }]} />
      {children}
    </View>
  );
}

export function BrandRow() {
  return (
    <View style={g.brandRow}>
      <Image source={require("../../../assets/icon.png")} style={g.brandIcon} />
      <Image source={require("../../../assets/wordmark.png")} style={g.brandWord} resizeMode="contain" accessibilityLabel="CollegeGo" />
    </View>
  );
}
export const BrandChip = BrandRow;

export function Press({ onPress, disabled, style, children, label, flex }: { onPress: () => void; disabled?: boolean; style?: any; children: React.ReactNode; label?: string; flex?: boolean }) {
  const p = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: p.value }] }));
  return (
    <Animated.View style={[flex && { flex: 1 }, a]}>
      <Pressable
        onPressIn={() => (p.value = withTiming(0.97, { duration: 110 }))}
        onPressOut={() => (p.value = withTiming(1, { duration: 200 }))}
        onPress={() => {
          tick();
          onPress();
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export function Heading({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={g.headIcon}>
        <Ionicons name={icon} size={22} color={ACCENT} />
      </View>
      <Text style={g.title}>{title}</Text>
      {subtitle ? <Text style={g.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function HintRow({ text, link, onPress }: { text: string; link: string; onPress: () => void }) {
  return (
    <View style={g.hintRow}>
      <Text style={g.hintText}>{text}</Text>
      <TouchableOpacity
        onPress={() => {
          tick();
          onPress();
        }}
        hitSlop={10}
        style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
      >
        <Text style={g.hintLink}>{link}</Text>
        <Ionicons name="arrow-forward" size={14} color={ACCENT} />
      </TouchableOpacity>
    </View>
  );
}

export function OptionCard({
  icon,
  label,
  onPress,
  loading,
  selected,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  loading?: boolean;
  selected?: boolean;
}) {
  const s = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    s.value = withTiming(selected ? 1 : 0, { duration: 260, easing: EASE });
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const ring = useAnimatedStyle(() => ({
    borderColor: interpolateColor(s.value, [0, 1], ["rgba(11,61,145,0)", "rgba(11,61,145,0.9)"]),
  }));
  const arrow = useAnimatedStyle(() => ({ transform: [{ rotate: `${s.value * 90}deg` }] }));
  return (
    <Press onPress={onPress} disabled={loading} label={`Continue with ${label}`} flex>
      <Glass style={g.option}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 24, borderWidth: 1.5 }, ring]} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={g.optionIcon}>{loading ? <ActivityIndicator color={TEXT} /> : icon}</View>
          <Animated.View style={arrow}>
            <Ionicons name="arrow-forward" size={16} color={FAINT} />
          </Animated.View>
        </View>
        <View>
          <Text style={g.optionWith}>with</Text>
          <Text style={g.optionLabel}>{label}</Text>
        </View>
      </Glass>
    </Press>
  );
}

export function GlassInput({
  icon,
  suffix,
  right,
  onFocus,
  onBlur,
  ref,
  ...props
}: TextInputProps & { icon: keyof typeof Ionicons.glyphMap; suffix?: string; right?: React.ReactNode; ref?: React.Ref<TextInput> }) {
  const f = useSharedValue(0);
  const a = useAnimatedStyle(() => ({
    borderColor: interpolateColor(f.value, [0, 1], ["rgba(14,26,51,0.08)", "rgba(11,61,145,0.75)"]),
    backgroundColor: interpolateColor(f.value, [0, 1], ["rgba(255,255,255,0.75)", "rgba(255,255,255,0.98)"]),
  }));
  return (
    <Animated.View style={[g.inputWrap, a]}>
      <Ionicons name={icon} size={18} color={MUTED} />
      <TextInput
        ref={ref}
        style={g.input}
        placeholderTextColor={FAINT}
        selectionColor={ACCENT}
        onFocus={(e) => {
          f.value = withTiming(1, { duration: 180 });
          onFocus?.(e);
        }}
        onBlur={(e) => {
          f.value = withTiming(0, { duration: 180 });
          onBlur?.(e);
        }}
        {...props}
      />
      {suffix ? <Text style={g.suffix}>{suffix}</Text> : null}
      {right}
    </Animated.View>
  );
}

export function PrimaryButton({ label, onPress, loading, icon = "arrow-forward" }: { label: string; onPress: () => void; loading?: boolean; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Press onPress={onPress} disabled={loading} style={g.primaryBtn} label={label}>
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          <Text style={g.primaryText}>{label}</Text>
          <Ionicons name={icon} size={18} color="#fff" />
        </>
      )}
    </Press>
  );
}

export function RoundBack({ onPress }: { onPress: () => void }) {
  return (
    <Press onPress={onPress} label="Back" style={g.back}>
      <Ionicons name="arrow-back" size={20} color="#fff" />
    </Press>
  );
}

export function Footer({ text }: { text: React.ReactNode }) {
  return (
    <View style={g.footer}>
      <Ionicons name="shield-checkmark-outline" size={14} color={FAINT} />
      <Text style={g.footerText}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  glassShadow: {
    shadowColor: "#1E2A6B",
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
});

export const g = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 18, gap: 20 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandIcon: { width: 34, height: 34, borderRadius: 10 },
  brandText: { fontSize: 16, fontWeight: "700", color: TEXT, letterSpacing: -0.2 },
  brandWord: { width: 99, height: 22 },
  headIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(11,61,145,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 40, fontWeight: "800", color: TEXT, letterSpacing: -1.4, lineHeight: 44 },
  subtitle: { fontSize: 15, fontWeight: "500", color: MUTED, lineHeight: 22, maxWidth: 340 },
  hintRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  hintText: { fontSize: 14, fontWeight: "500", color: TEXT, flexShrink: 1 },
  hintLink: { fontSize: 14, fontWeight: "700", color: ACCENT },
  options: { flexDirection: "row", gap: 12 },
  option: { height: 140, padding: 16, justifyContent: "space-between" },
  optionIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  optionWith: { fontSize: 12.5, fontWeight: "500", color: MUTED },
  optionLabel: { fontSize: 17, fontWeight: "700", color: TEXT, marginTop: 1, letterSpacing: -0.2 },
  panel: { padding: 14, gap: 12 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 15,
    borderWidth: 1,
  },
  input: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: "500", color: TEXT, paddingVertical: 0 },
  suffix: { fontSize: 13, fontWeight: "600", color: FAINT },
  primaryBtn: {
    height: 54,
    borderRadius: 16,
    backgroundColor: TEXT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryText: { color: "#fff", fontSize: 15.5, fontWeight: "700" },
  back: { width: 52, height: 52, borderRadius: 26, backgroundColor: TEXT, alignItems: "center", justifyContent: "center" },
  link: { fontSize: 13.5, fontWeight: "600", color: ACCENT },
  note: { fontSize: 12.5, color: MUTED, textAlign: "center", lineHeight: 18 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  footerText: { fontSize: 12, fontWeight: "500", color: FAINT, flexShrink: 1, textAlign: "center" },
});
