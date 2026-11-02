import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView, Alert, ActivityIndicator } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, radius, typography } from "../theme/theme";
import { Club, ClubCoreMember, CORE_ROLES, updateClubCoreMembers } from "../firebase/clubsService";

const SHOWN = 4;

function initials(name: string): string {
  return name
    .replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function ClubCoreTeam({ club, canEdit }: { club: Club; canEdit: boolean }) {
  const members = club.coreMembers ?? [];
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ClubCoreMember[]>([]);
  const [rolePickerFor, setRolePickerFor] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  if (members.length === 0 && !canEdit) return null;

  const visible = expanded ? members : members.slice(0, SHOWN);

  const startEdit = () => {
    setDraft(members.length ? members.map((m) => ({ ...m })) : [{ name: "", role: "Co-lead" }]);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateClubCoreMembers(club.id, draft);
      setEditing(false);
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Core team</Text>
        {canEdit && (
          <TouchableOpacity onPress={startEdit} hitSlop={8}>
            <Text style={styles.editLink}>{members.length ? "Edit" : "Add members"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {members.length === 0 ? (
        <Text style={styles.empty}>No core members added yet.</Text>
      ) : (
        <View style={styles.grid}>
          {visible.map((m, i) => (
            <View key={`${m.name}-${i}`} style={styles.member}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(m.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {m.name}
                </Text>
                <Text style={styles.role} numberOfLines={1}>
                  {m.role}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
      {members.length > SHOWN && (
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.more}>
          <Text style={styles.editLink}>{expanded ? "Show less" : `Show all ${members.length}`}</Text>
        </TouchableOpacity>
      )}

      <Modal visible={editing} animationType="slide" transparent onRequestClose={() => setEditing(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.headerRow}>
              <Text style={styles.sheetTitle}>Core team</Text>
              <TouchableOpacity onPress={() => setEditing(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {rolePickerFor !== null ? (
              <ScrollView style={{ maxHeight: 420 }}>
                <Text style={styles.empty}>Pick a role for {draft[rolePickerFor]?.name || "this member"}</Text>
                {CORE_ROLES.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={styles.roleOption}
                    onPress={() => {
                      setDraft((d) => d.map((x, j) => (j === rolePickerFor ? { ...x, role: r } : x)));
                      setRolePickerFor(null);
                    }}
                  >
                    <Text style={styles.roleOptionText}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              {draft.map((m, i) => (
                <View key={i} style={styles.editRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="Full name"
                    placeholderTextColor={colors.textSecondary}
                    value={m.name}
                    maxLength={50}
                    onChangeText={(t) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, name: t } : x)))}
                  />
                  <TouchableOpacity style={styles.roleButton} onPress={() => setRolePickerFor(i)}>
                    <Text style={styles.roleButtonText} numberOfLines={1}>
                      {m.role}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDraft((d) => d.filter((_, j) => j !== i))} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              {draft.length < 20 && (
                <TouchableOpacity style={styles.addRow} onPress={() => setDraft((d) => [...d, { name: "", role: "Core member" }])}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                  <Text style={styles.editLink}>Add a member</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
            )}
            <TouchableOpacity style={styles.saveButton} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.saveText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>

      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { ...typography.h3, color: colors.textPrimary },
  editLink: { fontSize: 13, fontWeight: "700", color: colors.primary },
  empty: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.sm, rowGap: spacing.sm },
  member: { width: "50%", flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingRight: spacing.sm },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.badge.purple.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 12, fontWeight: "800", color: colors.badge.purple.fg },
  name: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  role: { fontSize: 11, color: colors.textSecondary },
  more: { marginTop: spacing.sm },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  editRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    color: colors.textPrimary,
  },
  roleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 130,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  roleButtonText: { fontSize: 12, color: colors.textPrimary, flexShrink: 1 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md },
  saveButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  saveText: { color: colors.onPrimary, fontWeight: "800" },
  roleOption: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  roleOptionText: { ...typography.body, color: colors.textPrimary },
});
