import React, { useState, useEffect, useMemo, useCallback, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Linking,
  Modal,
  ScrollView,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, radius, typography } from "../theme/theme";
import { subscribeToFacultyDirectory, FacultyMember } from "../firebase/facultyService";
import { subscribeToTnpCoordinators, StudentCoordinator } from "../firebase/tnpCoordinatorsService";
import { isInCabin, cabinSince } from "../utils/cabin";
import LoadingSpinner from "../components/LoadingSpinner";

const DEPARTMENT_LABELS: Record<string, string> = {
  UGCSE: "Computer Science and Engineering",
  UGECE: "Electronics and Communication Engineering",
  UGPAS: "Applied Sciences",
  UGMCS: "Mathematics and Computing Sciences",
  TNP: "Training and Placement",
  ADMIN: "Administration",
};

const departmentLabel = (code?: string) => (code ? DEPARTMENT_LABELS[code] ?? code : undefined);

type FolderId = "ALL" | "UGCSE" | "UGECE" | "UGMCS" | "TNP" | "ADMIN" | "OTHER";

const FOLDERS: { id: FolderId; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "UGCSE", label: "CSE" },
  { id: "UGECE", label: "ECE" },
  { id: "UGMCS", label: "MCS" },
  { id: "OTHER", label: "PAS" },
  { id: "ADMIN", label: "Admin" },
  { id: "TNP", label: "TnP" },
];

function folderFor(department?: string): FolderId {
  if (department === "UGCSE" || department === "UGECE" || department === "UGMCS" || department === "TNP" || department === "ADMIN") {
    return department;
  }
  return "OTHER";
}

const isInFolder = (m: FacultyMember, folder: FolderId) =>
  folder === "ALL" || folderFor(m.department) === folder || !!m.additionalDepartments?.includes(folder);

function designationRank(designation?: string): number {
  if (!designation) return 3;
  const d = designation.toLowerCase();
  if (d.includes("director")) return -1;
  if (d.includes("head") || d.includes("dean")) return 0;
  if (d.includes("contractual")) return 2;
  return 1;
}

const compareFaculty = (a: FacultyMember, b: FacultyMember) =>
  designationRank(a.designation) - designationRank(b.designation) || a.name.localeCompare(b.name);

const roleBadge = (m: FacultyMember) => {
  if (designationRank(m.designation) > 0) return null;
  const d = m.designation?.toLowerCase() ?? "";
  return d.includes("director") ? "Director" : d.includes("dean") ? "Dean" : "HOD";
};

const open = (url: string) => Linking.openURL(url).catch(() => {});

function Avatar({ member, size = 52 }: { member: FacultyMember; size?: number }) {
  const here = isInCabin(member.inCabin, member.inCabinAt);
  const initials =
    member.name
      ?.replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  const box = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.avatarRing, { borderColor: here ? colors.success : "transparent", borderRadius: size / 2 + 4 }]}>
      {member.photoUrl ? (
        <Image source={{ uri: member.photoUrl }} style={box} />
      ) : (
        <View style={[styles.avatar, box]}>
          <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{initials}</Text>
        </View>
      )}
    </View>
  );
}

function CabinPill({ member }: { member: FacultyMember }) {
  const here = isInCabin(member.inCabin, member.inCabinAt);
  if (!here) return null;
  const since = cabinSince(member.inCabinAt);
  return (
    <View style={styles.cabinPill}>
      <View style={styles.cabinDot} />
      <Text style={styles.cabinText}>In cabin{since ? ` since ${since}` : ""}</Text>
    </View>
  );
}

function Actions({ member }: { member: FacultyMember }) {
  return (
    <View style={styles.actionRow}>
      <TouchableOpacity style={styles.actionBtn} onPress={() => open(`mailto:${member.email}`)} accessibilityLabel={`Email ${member.name}`}>
        <Ionicons name="mail-outline" size={16} color={colors.primary} />
        <Text style={styles.actionText}>Email</Text>
      </TouchableOpacity>
      {member.phone ? (
        <TouchableOpacity style={styles.actionBtn} onPress={() => open(`tel:${member.phone}`)} accessibilityLabel={`Call ${member.name}`}>
          <Ionicons name="call-outline" size={16} color={colors.primary} />
          <Text style={styles.actionText}>Call</Text>
        </TouchableOpacity>
      ) : null}
      {member.roleEmail ? (
        <TouchableOpacity style={styles.actionBtn} onPress={() => open(`mailto:${member.roleEmail}`)} accessibilityLabel={`Email ${member.name}'s office`}>
          <Ionicons name="business-outline" size={16} color={colors.primary} />
          <Text style={styles.actionText}>Office</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const FacultyCard = memo(function FacultyCard({ member, onOpen }: { member: FacultyMember; onOpen: (m: FacultyMember) => void }) {
  const badge = roleBadge(member);
  return (
    <TouchableOpacity style={styles.card} onPress={() => onOpen(member)} activeOpacity={0.85} accessibilityRole="button">
      <View style={styles.cardTop}>
        <Avatar member={member} />
        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {member.name}
            </Text>
            {member.shortForm ? <Text style={styles.short}>{member.shortForm}</Text> : null}
          </View>
          <Text style={styles.subtitle} numberOfLines={2}>
            {[member.designation, departmentLabel(member.department)].filter(Boolean).join(" · ")}
          </Text>
          <View style={styles.badgeRow}>
            <CabinPill member={member} />
            {badge ? (
              <View style={[styles.tag, { backgroundColor: colors.badge.blue.bg }]}>
                <Text style={[styles.tagText, { color: colors.badge.blue.fg }]}>{badge}</Text>
              </View>
            ) : null}
            {member.tnpInCharge ? (
              <View style={[styles.tag, { backgroundColor: colors.badge.purple.bg }]}>
                <Text style={[styles.tagText, { color: colors.badge.purple.fg }]}>TnP in-charge</Text>
              </View>
            ) : null}
          </View>
          {member.officeLocation ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.metaText} numberOfLines={1}>
                {member.officeLocation}
                {member.officeHours ? ` · ${member.officeHours}` : ""}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <Actions member={member} />
    </TouchableOpacity>
  );
});

function DetailSheet({ member, onClose }: { member: FacultyMember | null; onClose: () => void }) {
  if (!member) return null;
  const research = [
    member.publicationsCount ? `${member.publicationsCount} publication${member.publicationsCount === 1 ? "" : "s"}` : null,
    member.researchAreas || null,
  ].filter(Boolean);
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.grabber} />
          <View style={styles.modalHeader}>
            <Avatar member={member} size={60} />
            <View style={{ flex: 1 }}>
              <Text style={styles.modalName}>{member.name}</Text>
              <Text style={styles.subtitle}>{[member.designation, departmentLabel(member.department)].filter(Boolean).join(" · ")}</Text>
              <View style={[styles.badgeRow, { marginTop: 6 }]}>
                <CabinPill member={member} />
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={{ gap: spacing.md }}>
            {member.officeLocation || member.officeHours ? (
              <View style={styles.infoCard}>
                {member.officeLocation ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="location-outline" size={18} color={colors.primary} />
                    <Text style={styles.infoText}>{member.officeLocation}</Text>
                  </View>
                ) : null}
                {member.officeHours ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="time-outline" size={18} color={colors.primary} />
                    <Text style={styles.infoText}>{member.officeHours}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {member.aboutMe ? (
              <View>
                <Text style={styles.sectionLabel}>About</Text>
                <Text style={styles.bodyText}>{member.aboutMe}</Text>
              </View>
            ) : null}
            {research.length ? (
              <View>
                <Text style={styles.sectionLabel}>Research</Text>
                {research.map((r) => (
                  <Text key={r as string} style={styles.bodyText}>
                    {r}
                  </Text>
                ))}
              </View>
            ) : null}
            {!member.aboutMe && !research.length ? (
              <Text style={styles.emptyNote}>{member.name} hasn't added a bio or research summary yet.</Text>
            ) : null}
          </ScrollView>
          <Actions member={member} />
        </View>
      </View>
    </Modal>
  );
}

const CoordinatorCard = memo(function CoordinatorCard({ c }: { c: StudentCoordinator }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.badge.green.bg }]}>
          <Text style={[styles.avatarText, { color: colors.badge.green.fg }]}>{c.name?.trim()?.[0]?.toUpperCase() ?? "?"}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.name}>{c.name}</Text>
          <Text style={styles.subtitle}>{[c.role, c.branch, c.yearLabel].filter(Boolean).join(" · ")}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.tag, { backgroundColor: colors.badge.green.bg }]}>
              <Text style={[styles.tagText, { color: colors.badge.green.fg }]}>Student coordinator</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => open(`mailto:${c.email}`)}>
          <Ionicons name="mail-outline" size={16} color={colors.primary} />
          <Text style={styles.actionText}>Email</Text>
        </TouchableOpacity>
        {c.phone ? (
          <TouchableOpacity style={styles.actionBtn} onPress={() => open(`tel:${c.phone}`)}>
            <Ionicons name="call-outline" size={16} color={colors.primary} />
            <Text style={styles.actionText}>Call</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
});

export default function FacultyDirectoryScreen() {
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [coordinators, setCoordinators] = useState<StudentCoordinator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState<FolderId>("ALL");
  const [cabinOnly, setCabinOnly] = useState(false);
  const [selected, setSelected] = useState<FacultyMember | null>(null);

  useEffect(
    () =>
      subscribeToFacultyDirectory((data) => {
        setFaculty(data);
        setLoading(false);
      }),
    [],
  );
  useEffect(() => subscribeToTnpCoordinators(setCoordinators), []);

  const inCabinCount = useMemo(() => faculty.filter((f) => isInCabin(f.inCabin, f.inCabinAt)).length, [faculty]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return faculty
      .filter((f) => isInFolder(f, folder))
      .filter((f) => !cabinOnly || isInCabin(f.inCabin, f.inCabinAt))
      .filter(
        (f) =>
          !q ||
          [f.name, f.shortForm, f.designation, f.department, departmentLabel(f.department), f.researchAreas, f.officeLocation].some((v) =>
            v?.toLowerCase().includes(q),
          ),
      )
      .sort(compareFaculty);
  }, [faculty, folder, cabinOnly, search]);

  const onOpen = useCallback((m: FacultyMember) => setSelected(m), []);
  const renderItem = useCallback(({ item }: { item: FacultyMember }) => <FacultyCard member={item} onOpen={onOpen} />, [onOpen]);

  const header = (
    <View style={styles.header}>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, subject area or cabin"
          placeholderTextColor={colors.textSecondary}
          autoCorrect={false}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={10} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
        <TouchableOpacity
          style={[styles.chip, styles.cabinChip, cabinOnly && styles.cabinChipOn]}
          onPress={() => setCabinOnly((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ selected: cabinOnly }}
        >
          <View style={[styles.cabinDot, cabinOnly && { backgroundColor: colors.onPrimary }]} />
          <Text style={[styles.chipText, cabinOnly && { color: colors.onPrimary }]}>In cabin now · {inCabinCount}</Text>
        </TouchableOpacity>
        {FOLDERS.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.chip, folder === f.id && styles.chipOn]}
            onPress={() => setFolder(f.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: folder === f.id }}
          >
            <Text style={[styles.chipText, folder === f.id && styles.chipTextOn]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.count}>
        {shown.length} {shown.length === 1 ? "person" : "people"}
        {cabinOnly ? " in their cabin right now" : ""}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      {loading ? (
        <View style={styles.center}>
          <LoadingSpinner />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(item) => item.uid ?? item.email}
          renderItem={renderItem}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={cabinOnly ? "time-outline" : "people-outline"} size={36} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>{cabinOnly ? "No one has marked themselves in cabin" : "No matches"}</Text>
              <Text style={styles.emptyNote}>
                {cabinOnly ? "Faculty mark this from their Home screen. Try again later, or email them." : "Try a different name or department."}
              </Text>
            </View>
          }
          ListFooterComponent={
            folder === "TNP" && coordinators.length > 0 && !cabinOnly ? (
              <View style={{ marginTop: spacing.md }}>
                <Text style={styles.sectionTitle}>Student coordinators</Text>
                {coordinators.map((c) => (
                  <CoordinatorCard key={c.id} c={c} />
                ))}
              </View>
            ) : null
          }
        />
      )}
      <DetailSheet member={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl * 2, maxWidth: 760, width: "100%", alignSelf: "center" },
  header: { paddingTop: spacing.sm, gap: 12, marginBottom: 4 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: "500", color: colors.textPrimary, paddingVertical: 12 },
  chipScroll: { flexGrow: 0, flexShrink: 0, marginHorizontal: -spacing.md },
  chips: { gap: 8, paddingHorizontal: spacing.md },
  chip: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipOn: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  chipText: { fontSize: 13.5, fontWeight: "700", color: colors.textSecondary },
  chipTextOn: { color: colors.background },
  cabinChip: { borderColor: colors.successBorder, backgroundColor: colors.successBg },
  cabinChipOn: { backgroundColor: colors.success, borderColor: colors.success },
  count: { fontSize: 13, fontWeight: "600", color: colors.textSecondary, paddingHorizontal: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 10,
    gap: 12,
  },
  cardTop: { flexDirection: "row", gap: 12 },
  avatarRing: { borderWidth: 2, padding: 2, alignSelf: "flex-start" },
  avatar: { backgroundColor: colors.badge.blue.bg, alignItems: "center", justifyContent: "center" },
  avatarText: { fontWeight: "800", color: colors.badge.blue.fg },
  cardBody: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  name: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, letterSpacing: -0.2, flexShrink: 1 },
  short: { fontSize: 12.5, fontWeight: "700", color: colors.textSecondary },
  subtitle: { fontSize: 13, fontWeight: "600", color: colors.textSecondary, lineHeight: 18 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  tag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { fontSize: 11.5, fontWeight: "800" },
  cabinPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.successBg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  cabinDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  cabinText: { fontSize: 11.5, fontWeight: "800", color: colors.successFg },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  metaText: { fontSize: 12.5, fontWeight: "600", color: colors.textSecondary, flexShrink: 1 },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionText: { fontSize: 13.5, fontWeight: "700", color: colors.primary },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.sm },
  empty: { alignItems: "center", gap: 6, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, textAlign: "center" },
  emptyNote: { fontSize: 13.5, fontWeight: "500", color: colors.textSecondary, textAlign: "center", lineHeight: 19 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.lg,
    paddingTop: 10,
    maxHeight: "84%",
    gap: spacing.md,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  grabber: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: colors.border },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  modalName: { fontSize: 19, fontWeight: "800", color: colors.textPrimary, letterSpacing: -0.3 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  modalScroll: { flexGrow: 0 },
  infoCard: { backgroundColor: colors.surfaceAlt, borderRadius: 16, padding: 12, gap: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoText: { fontSize: 14, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 },
  sectionLabel: { fontSize: 12, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  bodyText: { fontSize: 14.5, color: colors.textPrimary, lineHeight: 21 },
});
