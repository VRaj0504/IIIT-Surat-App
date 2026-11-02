import React, { useMemo, useRef, useState } from "react";
import { Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../theme/theme";
import { SignatureVector } from "../../firebase/medicalService";

const INK = "#1E2A78";
const r1 = (n: number) => Math.round(n * 10) / 10;

export function SignatureView({ sig, height = 56, width }: { sig: SignatureVector; height?: number; width?: number }) {
  const w = width ?? Math.round((sig.w / sig.h) * height);
  if (sig.png) return <Image source={{ uri: `data:image/png;base64,${sig.png}` }} style={{ width: w, height }} resizeMode="contain" accessibilityLabel="Signature" />;
  return (
    <Svg width={w} height={height} viewBox={`0 0 ${sig.w} ${sig.h}`}>
      {sig.paths.map((d, i) => (
        <Path key={i} d={d} stroke={INK} strokeWidth={Math.max(2.4, sig.w / 70)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

export default function SignaturePad({
  value,
  onChange,
  height = 170,
}: {
  value: SignatureVector | null;
  onChange: (sig: SignatureVector | null) => void;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const [live, setLive] = useState<string>("");
  const cur = useRef<string>("");
  const pts = useRef(0);
  const state = useRef({ value, width, onChange });
  state.current = { value, width, onChange };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          cur.current = `M${r1(x)} ${r1(y)}`;
          pts.current = 1;
          setLive(cur.current);
        },
        onPanResponderMove: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          if (pts.current > 600) return;
          cur.current += ` L${r1(x)} ${r1(y)}`;
          pts.current += 1;
          setLive(cur.current);
        },
        onPanResponderRelease: () => {
          const { value: v, width: w, onChange: change } = state.current;
          let d = cur.current;
          if (!d || w === 0) return;
          if (pts.current === 1) {
            const [, xs, ys] = d.match(/^M([\d.]+) ([\d.]+)/) ?? [];
            d = `${d} L${r1(Number(xs) + 0.5)} ${r1(Number(ys) + 0.5)}`;
          }
          const base = v && !v.png && v.w === Math.round(w) ? v.paths : [];
          change({ w: Math.round(w), h: height, paths: [...base, d].slice(-200) });
          cur.current = "";
          setLive("");
        },
      }),
    [height],
  );

  const scaled = value && width && value.w !== Math.round(width);
  const webNoScroll: any = Platform.OS === "web" ? { touchAction: "none", cursor: "crosshair", userSelect: "none" } : null;

  return (
    <View>
      <View
        style={[s.pad, { height }, webNoScroll]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        {...pan.panHandlers}
      >
        <View style={s.baseline} pointerEvents="none" />
        <Text style={s.hint} pointerEvents="none">
          {value || live ? "" : "Sign here with your finger or mouse"}
        </Text>
        {value?.png && !live ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Image source={{ uri: `data:image/png;base64,${value.png}` }} style={{ flex: 1, margin: 12 }} resizeMode="contain" />
          </View>
        ) : null}
        {width > 0 ? (
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none" viewBox={scaled ? `0 0 ${value!.w} ${value!.h}` : undefined}>
            {(value?.paths ?? []).map((d, i) => (
              <Path key={i} d={d} stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {live ? <Path d={live} stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          </Svg>
        ) : null}
      </View>
      <View style={s.row}>
        <Text style={s.small}>Your signature is printed on the official form.</Text>
        <Pressable onPress={() => onChange(null)} style={s.clear} accessibilityRole="button" disabled={!value}>
          <Ionicons name="refresh" size={14} color={value ? colors.primary : colors.textSecondary} />
          <Text style={[s.clearText, !value && { color: colors.textSecondary }]}>Clear</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pad: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, backgroundColor: "#FBFCFF", overflow: "hidden" },
  baseline: { position: "absolute", left: 18, right: 18, bottom: 34, height: 1, backgroundColor: "#C9D2E3" },
  hint: { position: "absolute", left: 0, right: 0, bottom: 12, textAlign: "center", fontSize: 12, color: colors.textSecondary },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  small: { fontSize: 11, color: colors.textSecondary, flex: 1 },
  clear: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  clearText: { fontSize: 13, fontWeight: "700", color: colors.primary },
});
