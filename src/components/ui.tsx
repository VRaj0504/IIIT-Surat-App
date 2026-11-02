import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, radius, typography, isDark } from "../theme/theme";

type IconName = keyof typeof Ionicons.glyphMap;

export function Section({
  title,
  hint,
  right,
  children,
  style,
}: {
  title?: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[ui.section, style]}>
      {(title || right) && (
        <View style={ui.sectionHead}>
          <View style={{ flex: 1 }}>
            {title ? <Text style={ui.sectionTitle}>{title}</Text> : null}
            {hint ? <Text style={ui.sectionHint}>{hint}</Text> : null}
          </View>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [ui.card, style, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[ui.card, style]}>{children}</View>;
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={ui.fieldLabel}>{children}</Text>;
}

export function SelectField({
  label,
  value,
  placeholder,
  icon,
  onPress,
  disabled,
}: {
  label?: string;
  value?: string | null;
  placeholder: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <TouchableOpacity
        style={[ui.field, disabled && { opacity: 0.5 }]}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.primary} /> : null}
        <Text style={[ui.fieldText, !value && ui.fieldPlaceholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string; badge?: number }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[ui.segment, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[ui.segmentItem, active && ui.segmentItemActive]}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[ui.segmentText, active && ui.segmentTextActive]}>{o.label}</Text>
            {o.badge ? (
              <View style={[ui.segmentBadge, active && ui.segmentBadgeActive]}>
                <Text style={[ui.segmentBadgeText, active && { color: colors.primary }]}>{o.badge}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const PILL: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: colors.warningBg, fg: colors.warning, label: "Pending" },
  approved: { bg: colors.successBg, fg: colors.successFg, label: "Approved" },
  rejected: { bg: colors.dangerBg, fg: colors.danger, label: "Rejected" },
  resolved: { bg: colors.successBg, fg: colors.successFg, label: "Resolved" },
  info: { bg: colors.badge.blue.bg, fg: colors.badge.blue.fg, label: "" },
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const p = PILL[status] ?? PILL.info;
  return (
    <View style={[ui.pill, { backgroundColor: p.bg }]}>
      <Text style={[ui.pillText, { color: p.fg }]}>{label ?? p.label ?? status}</Text>
    </View>
  );
}

export type TimelineStep = {
  title: string;
  detail?: string | null;
  note?: string | null;
  state: "done" | "current" | "todo" | "rejected";
};

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <View style={{ marginTop: spacing.sm }}>
      {steps.map((s, i) => {
        const color =
          s.state === "done" ? colors.success : s.state === "rejected" ? colors.danger : s.state === "current" ? colors.primary : colors.border;
        const last = i === steps.length - 1;
        return (
          <View key={`${s.title}-${i}`} style={ui.tlRow}>
            <View style={ui.tlRail}>
              <View style={[ui.tlDot, { backgroundColor: s.state === "todo" ? colors.surface : color, borderColor: color }]}>
                {s.state === "done" && <Ionicons name="checkmark" size={11} color={colors.onPrimary} />}
                {s.state === "rejected" && <Ionicons name="close" size={11} color={colors.onPrimary} />}
                {s.state === "current" && <View style={ui.tlPulse} />}
              </View>
              {!last && <View style={[ui.tlLine, { backgroundColor: s.state === "done" ? colors.success : colors.border }]} />}
            </View>
            <View style={[ui.tlBody, last && { paddingBottom: 0 }]}>
              <Text style={[ui.tlTitle, s.state === "todo" && { color: colors.textSecondary }, s.state === "current" && { color: colors.primary }]}>
                {s.title}
              </Text>
              {s.detail ? <Text style={ui.tlDetail}>{s.detail}</Text> : null}
              {s.note ? <Text style={ui.tlNote}>“{s.note}”</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function EmptyState({ icon, title, hint }: { icon: IconName; title: string; hint?: string }) {
  return (
    <View style={ui.empty}>
      <View style={ui.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.primary} />
      </View>
      <Text style={ui.emptyTitle}>{title}</Text>
      {hint ? <Text style={ui.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  icon,
  tone = "primary",
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  tone?: "primary" | "secondary" | "danger" | "success";
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    tone === "primary" ? colors.primary : tone === "danger" ? colors.dangerBg : tone === "success" ? colors.success : colors.surface;
  const fg = tone === "primary" || tone === "success" ? colors.onPrimary : tone === "danger" ? colors.danger : colors.primary;
  return (
    <TouchableOpacity
      style={[ui.button, { backgroundColor: bg }, tone === "secondary" && ui.buttonOutline, (disabled || loading) && { opacity: 0.55 }, style]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[ui.buttonText, { color: fg }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function SheetPicker<T>({
  visible,
  title,
  items,
  keyOf,
  labelOf,
  sublabelOf,
  selectedKey,
  onPick,
  onClose,
  searchable,
  emptyText,
}: {
  visible: boolean;
  title: string;
  items: T[];
  keyOf: (t: T) => string;
  labelOf: (t: T) => string;
  sublabelOf?: (t: T) => string | undefined;
  selectedKey?: string | null;
  onPick: (t: T) => void;
  onClose: () => void;
  searchable?: boolean;
  emptyText?: string;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((t) => `${labelOf(t)} ${sublabelOf?.(t) ?? ""}`.toLowerCase().includes(s));
  }, [items, q, labelOf, sublabelOf]);
  const close = () => {
    setQ("");
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={ui.backdrop} onPress={close}>
          <Pressable style={ui.sheet} onPress={() => undefined}>
            <View style={ui.sheetHandle} />
            <View style={ui.sheetHead}>
              <Text style={ui.sheetTitle}>{title}</Text>
              <TouchableOpacity onPress={close} hitSlop={10} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {searchable && (
              <View style={ui.search}>
                <Ionicons name="search" size={16} color={colors.textSecondary} />
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder="Search"
                  placeholderTextColor={colors.textSecondary}
                  style={ui.searchInput}
                  autoCorrect={false}
                />
              </View>
            )}
            <FlatList
              data={shown}
              keyExtractor={keyOf}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 440 }}
              ListEmptyComponent={<Text style={ui.emptyHint}>{emptyText ?? "Nothing matches."}</Text>}
              renderItem={({ item }) => {
                const selected = keyOf(item) === selectedKey;
                const sub = sublabelOf?.(item);
                return (
                  <TouchableOpacity
                    style={[ui.sheetRow, selected && ui.sheetRowActive]}
                    onPress={() => {
                      onPick(item);
                      close();
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[ui.sheetRowText, selected && { color: colors.primary, fontWeight: "800" }]}>{labelOf(item)}</Text>
                      {sub ? <Text style={ui.sheetRowSub}>{sub}</Text> : null}
                    </View>
                    {selected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function dateRange(from: string, to: string): string {
  if (!from) return "";
  if (from === to || !to) return prettyDate(from);
  const days = Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000) + 1;
  return `${prettyDate(from)} – ${prettyDate(to)} · ${days} days`;
}

export const ui = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  sectionHead: { flexDirection: "row", alignItems: "flex-end", marginBottom: spacing.sm },
  sectionTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0.7, color: colors.textSecondary, textTransform: "uppercase" },
  sectionHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: colors.textPrimary, marginBottom: 6 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  fieldText: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  fieldPlaceholder: { color: colors.textSecondary, fontWeight: "500" },
  input: {
    minHeight: 50,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    fontSize: 15,
    color: colors.textPrimary,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.full,
    padding: 4,
    marginBottom: spacing.lg,
  },
  segmentItem: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  segmentItemActive: { backgroundColor: isDark ? colors.borderStrong : colors.surface, borderWidth: 1, borderColor: isDark ? colors.borderStrong : colors.border },
  segmentText: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
  segmentTextActive: { color: colors.textPrimary },
  segmentBadge: { minWidth: 20, paddingHorizontal: 6, borderRadius: radius.full, backgroundColor: colors.border, alignItems: "center" },
  segmentBadgeActive: { backgroundColor: colors.badge.blue.bg },
  segmentBadgeText: { fontSize: 11, fontWeight: "800", color: colors.textSecondary },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full, alignSelf: "flex-start" },
  pillText: { fontSize: 12, fontWeight: "800" },
  tlRow: { flexDirection: "row" },
  tlRail: { width: 26, alignItems: "center" },
  tlDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  tlPulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.onPrimary },
  tlLine: { width: 2, flex: 1, marginVertical: 2 },
  tlBody: { flex: 1, paddingLeft: spacing.sm, paddingBottom: spacing.md },
  tlTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  tlDetail: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  tlNote: { fontSize: 12, color: colors.textPrimary, marginTop: 4, fontStyle: "italic" },
  empty: { alignItems: "center", paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.badge.blue.bg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: { ...typography.h3, color: colors.textPrimary, textAlign: "center" },
  emptyHint: { ...typography.caption, color: colors.textSecondary, textAlign: "center", marginTop: 4 },
  button: {
    minHeight: 52,
    borderRadius: radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  buttonOutline: { borderWidth: 1.5, borderColor: colors.border },
  buttonText: { fontSize: 16, fontWeight: "800" },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  sheetTitle: { ...typography.h3, color: colors.textPrimary },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: colors.textPrimary },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  sheetRowActive: { backgroundColor: colors.badge.blue.bg },
  sheetRowText: { fontSize: 15, color: colors.textPrimary, fontWeight: "600" },
  sheetRowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
