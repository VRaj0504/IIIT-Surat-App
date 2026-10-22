import React, { useMemo, useState } from "react";
import { Modal, Pressable, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/theme";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const todayIso = () => {
  const t = new Date();
  return toIso(t.getFullYear(), t.getMonth(), t.getDate());
};
const pretty = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};

export default function DateField({
  value,
  onChange,
  placeholder = "Pick a date",
  min,
  max,
  style,
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  style?: any;
}) {
  const [open, setOpen] = useState(false);
  const start = value || min || todayIso();
  const [view, setView] = useState(() => {
    const [y, m] = start.split("-").map(Number);
    return { y, m: m - 1 };
  });

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const lead = (first.getDay() + 6) % 7;
    const count = new Date(view.y, view.m + 1, 0).getDate();
    return [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [view]);

  const shift = (dm: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + dm, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const openPicker = () => {
    const [y, m] = (value || min || todayIso()).split("-").map(Number);
    setView({ y, m: m - 1 });
    setOpen(true);
  };

  return (
    <>
      <TouchableOpacity style={[s.field, style]} onPress={openPicker} accessibilityRole="button" accessibilityLabel={value ? pretty(value) : placeholder}>
        <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
        <Text style={[s.fieldText, !value && { color: colors.textSecondary }]} numberOfLines={1}>
          {value ? pretty(value) : placeholder}
        </Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setOpen(false)}>
          <Pressable style={s.card} onPress={() => {}}>
            <View style={s.head}>
              <TouchableOpacity onPress={() => shift(-1)} hitSlop={10} accessibilityLabel="Previous month">
                <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={s.month}>
                {MONTHS[view.m]} {view.y}
              </Text>
              <TouchableOpacity onPress={() => shift(1)} hitSlop={10} accessibilityLabel="Next month">
                <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={s.grid}>
              {DAYS.map((d) => (
                <Text key={d} style={s.dow}>
                  {d}
                </Text>
              ))}
              {cells.map((d, i) => {
                if (d === null) return <View key={`e${i}`} style={s.cell} />;
                const iso = toIso(view.y, view.m, d);
                const off = (min && iso < min) || (max && iso > max);
                const on = iso === value;
                const today = iso === todayIso();
                return (
                  <TouchableOpacity
                    key={iso}
                    disabled={!!off}
                    style={[s.cell, on && s.cellOn]}
                    onPress={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                  >
                    <Text style={[s.day, today && s.today, on && s.dayOn, off && s.dayOff]}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={s.todayBtn}
              disabled={(min && todayIso() < min) || (max && todayIso() > max) ? true : false}
              onPress={() => {
                onChange(todayIso());
                setOpen(false);
              }}
            >
              <Text style={s.todayText}>Today</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fieldText: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  overlay: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: 24, padding: 16 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 4 },
  month: { fontSize: 17, fontWeight: "800", color: colors.textPrimary },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dow: { width: `${100 / 7}%`, textAlign: "center", fontSize: 12, fontWeight: "700", color: colors.textSecondary, paddingVertical: 6 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  cellOn: { backgroundColor: colors.primary },
  day: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  dayOn: { color: colors.onPrimary, fontWeight: "800" },
  dayOff: { color: colors.border },
  today: { color: colors.primary, fontWeight: "800" },
  todayBtn: { alignSelf: "center", marginTop: 8, paddingVertical: 8, paddingHorizontal: 16 },
  todayText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
