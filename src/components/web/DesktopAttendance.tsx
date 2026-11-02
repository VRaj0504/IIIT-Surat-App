import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../theme/theme";
import { SubjectAttendance, ATTENDANCE_TARGET } from "../../firebase/attendanceService";

const pointer: any = { cursor: "pointer" };
const T = ATTENDANCE_TARGET / 100;
const pctOf = (a: number, h: number) => (h ? Math.round((a / h) * 1000) / 10 : 0);

type Props = { rows: SubjectAttendance[]; semester: number; pending: string[]; error?: string; onRetry?: () => void };

export default function DesktopAttendance({ rows, semester, pending, error, onRetry }: Props) {
  const [plan, setPlan] = useState<Record<string, number>>({});
  const planning = Object.values(plan).some((v) => v > 0);

  let att = 0;
  let held = 0;
  let totalSkip = 0;
  let totalNeed = 0;
  const cards = rows.map((r) => {
    const planned = plan[r.subjectCode] ?? 0;
    const h = r.totalSessions + planned;
    const p = pctOf(r.presentCount, h);
    const canSkip = Math.max(0, Math.floor(r.presentCount / T - h + 1e-9));
    const need = p >= ATTENDANCE_TARGET ? 0 : Math.ceil((T * h - r.presentCount) / (1 - T) - 1e-9);
    att += r.presentCount;
    held += h;
    totalSkip += canSkip;
    totalNeed += need;
    const low = p < ATTENDANCE_TARGET;
    const near = !low && canSkip <= 1;
    return { r, planned, p, canSkip, need, low, near };
  });
  const overall = held ? pctOf(att, held) : null;

  const set = (code: string, v: number) => setPlan((x) => ({ ...x, [code]: Math.max(0, v) }));

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <View style={s.wrap}>
        <View style={s.top}>
          <View style={{ flex: 1, minWidth: 260 }}>
            <Text style={s.kicker}>
              Semester {semester} · target {ATTENDANCE_TARGET}%
            </Text>
          </View>
          <View style={s.stats}>
            <Stat label={planning ? "Overall (with plan)" : "Overall"} value={overall === null ? "–" : `${overall}%`} />
            <Stat label="Classes you can skip" value={String(totalSkip)} color={colors.success} />
            <Stat label="Need to attend" value={String(totalNeed)} color={colors.warning} />
          </View>
        </View>

        {!!error && (
          <Pressable onPress={onRetry} style={[s.error, pointer]}>
            <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
            <Text style={s.errorText}>{error} Click to retry.</Text>
          </Pressable>
        )}

        <View style={s.banner}>
          <Ionicons name="time-outline" size={28} color="#7CE3A5" />
          <View style={{ flex: 1, minWidth: 260 }}>
            <Text style={s.bannerTitle}>Skip planner</Text>
            <Text style={s.bannerSub}>Press + to try skipping upcoming classes. Each card shows where you'd land, before you decide.</Text>
          </View>
          {planning ? (
            <Pressable onPress={() => setPlan({})} style={[s.reset, pointer]}>
              <Text style={s.resetText}>Reset plan</Text>
            </Pressable>
          ) : null}
        </View>

        {rows.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="calendar-outline" size={32} color={colors.textSecondary} />
            <Text style={s.emptyTitle}>No classes marked yet</Text>
            <Text style={s.muted}>Your attendance shows up here as soon as a teacher marks a class.</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {cards.map(({ r, planned, p, canSkip, need, low, near }) => {
              const tone = low ? colors.danger : near ? colors.warning : colors.success;
              const verdict = low
                ? `Attend the next ${need} ${need === 1 ? "class" : "classes"} to get back to ${ATTENDANCE_TARGET}%`
                : canSkip === 0
                  ? "Right at the line. Don't skip the next one."
                  : `You can skip ${canSkip} more and stay above ${ATTENDANCE_TARGET}%`;
              const vBg = low ? colors.dangerBg : near ? colors.warningBg : colors.successBg;
              const vFg = low ? colors.dangerText : near ? colors.warning : colors.successFg;
              return (
                <View key={r.subjectCode} style={[s.card, low && { borderColor: colors.dangerBorder }]}>
                  <View style={s.cardTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.name} numberOfLines={2}>
                        {r.subjectName}
                      </Text>
                      <Text style={s.meta}>
                        {r.subjectCode} · {r.presentCount} of {r.totalSessions + planned} classes
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[s.pct, { color: tone }]}>{p}%</Text>
                      {planned > 0 ? <Text style={s.now}>now {r.percentage}%</Text> : null}
                    </View>
                  </View>
                  <View style={s.track}>
                    <View style={[s.fill, { width: `${Math.min(100, p)}%`, backgroundColor: tone }]} />
                    <View style={[s.mark, { left: `${ATTENDANCE_TARGET}%` }]} />
                  </View>
                  <Text style={[s.verdict, { backgroundColor: vBg, color: vFg }]}>{verdict}</Text>
                  <View style={s.planRow}>
                    <Text style={s.planLabel}>Plan to skip</Text>
                    <Pressable
                      onPress={() => set(r.subjectCode, planned - 1)}
                      disabled={planned === 0}
                      style={(st: any) => [s.stepBtn, pointer, st.hovered && s.stepHover, planned === 0 && { opacity: 0.4 }]}
                      accessibilityLabel={`Skip one less ${r.subjectName} class`}
                    >
                      <Ionicons name="remove" size={20} color={colors.textPrimary} />
                    </Pressable>
                    <Text style={s.planned}>{planned}</Text>
                    <Pressable
                      onPress={() => set(r.subjectCode, planned + 1)}
                      style={(st: any) => [s.stepBtn, pointer, st.hovered && s.stepHover]}
                      accessibilityLabel={`Skip one more ${r.subjectName} class`}
                    >
                      <Ionicons name="add" size={20} color={colors.textPrimary} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {pending.length > 0 && rows.length > 0 ? <Text style={s.muted}>No classes recorded yet for {pending.join(", ")}.</Text> : null}
        <Text style={s.foot}>
          A 2-hour lab counts as 2 classes. On-duty, approved event excusals and confirmed medical leave count as attended. Something wrong? Ask the subject teacher.
        </Text>
      </View>
    </ScrollView>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 },
  wrap: { width: "100%", maxWidth: 1120, alignSelf: "center", gap: 20 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 },
  kicker: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
  h1: { fontSize: 32, fontWeight: "800", letterSpacing: -0.8, color: colors.textPrimary, marginTop: 4 },
  stats: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  stat: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12 },
  statLabel: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  statValue: { fontSize: 24, fontWeight: "800", color: colors.textPrimary },
  error: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerBg, borderRadius: 12, padding: 12 },
  errorText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  banner: { flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap", backgroundColor: colors.heroBg, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 18 },
  bannerTitle: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  bannerSub: { fontSize: 14, color: colors.heroMuted },
  reset: { backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  resetText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  card: { flexGrow: 1, flexBasis: 320, minWidth: 300, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: 20, padding: 20, gap: 12 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  name: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  pct: { fontSize: 26, fontWeight: "800", lineHeight: 28 },
  now: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginTop: 4 },
  track: { height: 10, backgroundColor: colors.surfaceAlt, borderRadius: 999, position: "relative" },
  fill: { height: 10, borderRadius: 999 },
  mark: { position: "absolute", top: -4, width: 2, height: 18, backgroundColor: colors.textPrimary, opacity: 0.4 },
  verdict: { fontSize: 14, fontWeight: "700", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, overflow: "hidden" },
  planRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  planLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  stepBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  stepHover: { backgroundColor: colors.surfaceAlt },
  planned: { minWidth: 28, textAlign: "center", fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  empty: { alignItems: "center", gap: 8, padding: 40, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  muted: { fontSize: 14, color: colors.textSecondary },
  foot: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
});
