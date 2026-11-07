import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../theme/theme";
import { SIGN_STEPS, STEP_SHORT, type EventExcusal } from "../firebase/eventExcusalService";

/** FIC ✓ → DSW ✓ → Dean … progress for a 3-signature event excusal. */
export default function ExcusalSteps({ x }: { x: EventExcusal }) {
  const stage = x.stage ?? "fic";
  return (
    <View style={s.row}>
      {SIGN_STEPS.map((step, i) => {
        const signed = !!x.signatures?.[step];
        const current = stage === step;
        const failed = stage === "rejected" && !signed && (i === 0 || !!x.signatures?.[SIGN_STEPS[i - 1]]) && !SIGN_STEPS.slice(i + 1).some((n) => x.signatures?.[n]);
        const tone = signed ? colors.success : failed ? colors.danger : current ? colors.primary : colors.textSecondary;
        return (
          <React.Fragment key={step}>
            {i > 0 && <View style={[s.line, signed && { backgroundColor: colors.success }]} />}
            <View style={[s.pill, { borderColor: tone }, signed && { backgroundColor: colors.successBg }, failed && { backgroundColor: colors.dangerBg }]}>
              <Ionicons
                name={signed ? "checkmark-circle" : failed ? "close-circle" : current ? "time-outline" : "ellipse-outline"}
                size={13}
                color={tone}
              />
              <Text style={[s.text, { color: tone }]}>{STEP_SHORT[step]}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  text: { fontSize: 11.5, fontWeight: "800" },
  line: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4, maxWidth: 24 },
});
