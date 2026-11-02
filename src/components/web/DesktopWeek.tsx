import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { colors } from "../../theme/theme";
import type { TimetableSlot } from "../../firebase/timetableService";
import { expandFaculty } from "../../data/facultyLegend";
import { mergeContiguousSlots, toMinutes } from "../../utils/timetable";

type Slot = TimetableSlot & { branch?: string; semester?: number; section?: string };
type Day = { day: string; date: Date; slots: Slot[] };

const HOUR = 68;

function label(m: number) {
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}${h >= 12 ? " PM" : " AM"}`;
}
function clock(m: number) {
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, "0")}`;
}

export default function DesktopWeek({ days, todayName, nowMin, isFaculty }: { days: Day[]; todayName: string; nowMin: number; isFaculty: boolean }) {
  const prepared = days.map((d) => ({
    ...d,
    slots: mergeContiguousSlots(d.slots)
      .filter((x) => toMinutes(x.startTime) >= 0)
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)),
  }));
  const all = prepared.flatMap((d) => d.slots);
  const total = all.length;
  if (total === 0) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyTitle}>No classes on the timetable yet</Text>
        <Text style={s.muted}>It shows up here as soon as the academic office publishes it.</Text>
      </View>
    );
  }
  const start = Math.floor(Math.min(...all.map((x) => toMinutes(x.startTime))) / 60) * 60;
  const end = Math.ceil(Math.max(...all.map((x) => Math.max(toMinutes(x.endTime), toMinutes(x.startTime) + 50))) / 60) * 60;
  const hours: number[] = [];
  for (let m = start; m <= end; m += 60) hours.push(m);
  const height = ((end - start) / 60) * HOUR;
  const y = (m: number) => ((m - start) / 60) * HOUR;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
      <View style={s.grid}>
        <View style={s.headRow}>
          <View style={s.gutter} />
          {prepared.map((d) => {
            const today = d.day === todayName;
            const count = d.slots.length;
            return (
              <View key={d.day} style={[s.headCell, today && s.headToday]}>
                <Text style={[s.headDay, today && { color: colors.onPrimary }]}>{d.day.slice(0, 3).toUpperCase()}</Text>
                <Text style={[s.headDate, today && { color: colors.onPrimary }]}>{d.date.getDate()}</Text>
                <Text style={[s.headCount, today && { color: colors.heroMuted }]}>
                  {count ? `${count} ${count === 1 ? "class" : "classes"}` : "Free day"}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={[s.body, { height }]}>
          <View style={[s.gutter, { height }]}>
            {hours.map((m) => (
              <Text key={m} style={[s.hour, { top: y(m) - 8 }]}>
                {label(m)}
              </Text>
            ))}
          </View>
          {prepared.map((d) => {
            const today = d.day === todayName;
            return (
              <View key={d.day} style={[s.col, today && s.colToday, { height }]}>
                {hours.map((m) => (
                  <View key={m} style={[s.line, { top: y(m) }]} />
                ))}
                {d.slots.map((x, i) => {
                  const a = toMinutes(x.startTime);
                  const b = Math.max(toMinutes(x.endTime), a + 30);
                  const past = today && b <= nowMin;
                  const live = today && a <= nowMin && nowMin < b;
                  const lab = (x.room ?? "").toUpperCase().includes("LAB");
                  const tone = lab ? colors.tile.peach : colors.tile.blue;
                  const who = isFaculty
                    ? [x.branch, x.semester ? `Sem ${x.semester}` : null, x.section && x.section !== x.branch ? x.section : null].filter(Boolean).join(" ")
                    : expandFaculty(x.faculty ?? "");
                  const tall = b - a >= 50;
                  return (
                    <View
                      key={`${x.id}-${i}`}
                      style={[
                        s.card,
                        { top: y(a) + 2, height: y(b) - y(a) - 4, backgroundColor: live ? colors.primary : tone.bg },
                        past && { opacity: 0.45 },
                      ]}
                      accessibilityLabel={`${x.subjectName} ${clock(a)} to ${clock(b)} in ${x.room}`}
                    >
                      <Text style={[s.subj, { color: live ? colors.onPrimary : tone.fg }]} numberOfLines={b - a >= 90 ? 2 : 1}>
                        {x.subjectName || x.subjectCode}
                        {x.group ? ` · ${x.group}` : ""}
                      </Text>
                      <Text style={[s.meta, { color: live ? colors.onPrimary : colors.textPrimary }]} numberOfLines={1}>
                        {[x.room, `${clock(a)}–${clock(b)}`].filter(Boolean).join(" · ")}
                      </Text>
                      {tall ? (
                        <Text style={[s.meta2, { color: live ? colors.heroMuted : colors.textSecondary }]} numberOfLines={1}>
                          {who}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
                {today && nowMin >= start && nowMin <= end ? (
                  <View style={[s.now, { top: y(nowMin) }]} pointerEvents="none">
                    <View style={s.nowDot} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { paddingBottom: 48, paddingTop: 8 },
  grid: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1.5, borderColor: colors.border, padding: 16 },
  headRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  gutter: { width: 56 },
  headCell: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 14, backgroundColor: colors.surfaceAlt },
  headToday: { backgroundColor: colors.primary },
  headDay: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8, color: colors.textSecondary },
  headDate: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  headCount: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  body: { flexDirection: "row", gap: 8 },
  hour: { position: "absolute", right: 8, fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  col: { flex: 1, position: "relative", borderRadius: 12 },
  colToday: { backgroundColor: "rgba(11,61,145,0.04)" },
  line: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: colors.border },
  card: { position: "absolute", left: 3, right: 3, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, overflow: "hidden", gap: 1 },
  subj: { fontSize: 13, fontWeight: "800" },
  meta: { fontSize: 11, fontWeight: "700" },
  meta2: { fontSize: 11, fontWeight: "600" },
  now: { position: "absolute", left: -4, right: 0, height: 2, backgroundColor: colors.danger },
  nowDot: { position: "absolute", left: -2, top: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  empty: { margin: 32, padding: 40, alignItems: "center", gap: 6, backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1.5, borderColor: colors.border },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  muted: { fontSize: 14, color: colors.textSecondary },
});
