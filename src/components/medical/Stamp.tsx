import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/theme";
import { MedicalSign, fmtStamp } from "../../firebase/medicalService";
import { SignatureView } from "./SignaturePad";

export function Stamp({ decision, at, small }: { decision: "approved" | "not_approved"; at?: string; small?: boolean }) {
  const ok = decision === "approved";
  const c = ok ? "#15803D" : "#C1272D";
  return (
    <View style={[s.stamp, { borderColor: c }, small && s.small]}>
      <Text style={[s.label, { color: c }, small && { fontSize: 11 }]}>{ok ? "APPROVED" : "NOT APPROVED"}</Text>
      {at ? <Text style={[s.at, { color: c }]}>{at}</Text> : null}
    </View>
  );
}

export function SignedBlock({ title, name, sign }: { title: string; name: string; sign?: MedicalSign | null }) {
  return (
    <View style={s.block}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.name} numberOfLines={1}>
          {sign?.byName ?? name}
        </Text>
        {sign?.comment ? <Text style={s.comment}>“{sign.comment}”</Text> : null}
        {!sign ? <Text style={s.waiting}>Not signed yet</Text> : null}
      </View>
      {sign ? (
        <View style={s.right}>
          <Stamp decision={sign.decision} at={fmtStamp(sign.at)} small />
          <SignatureView sig={sign.signature} height={40} />
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  stamp: { borderWidth: 2, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: "-6deg" }], alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.6)" },
  small: { paddingHorizontal: 7, paddingVertical: 2 },
  label: { fontSize: 15, fontWeight: "900", letterSpacing: 1 },
  at: { fontSize: 9, fontWeight: "600" },
  block: { flexDirection: "row", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center" },
  title: { fontSize: 11, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 },
  name: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginTop: 1 },
  comment: { fontSize: 13, color: colors.textPrimary, fontStyle: "italic", marginTop: 3 },
  waiting: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  right: { alignItems: "flex-end", gap: 4 },
});
