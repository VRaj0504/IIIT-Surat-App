import React, { useState, useEffect, useMemo, useCallback, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Linking,
  BackHandler,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { subscribeToFacultyDirectory, FacultyMember } from "../firebase/facultyService";
import { subscribeToTnpCoordinators, StudentCoordinator } from "../firebase/tnpCoordinatorsService";
import LoadingSpinner from "../components/LoadingSpinner";

// Department codes as seeded in scripts/seed-allowlist.js (from the
// allowlist, carried onto the profile at signup — see AuthContext.ts).
// Best-guess expansions of the institute's internal codes; correct these
// if any are wrong.
const DEPARTMENT_LABELS: Record<string, string> = {
  UGCSE: "Computer Science and Engineering",
  UGECE: "Electronics and Communication Engineering",
  UGPAS: "Applied Sciences",
  UGMCS: "Mathematics and Computing Sciences",
  TNP: "Training and Placement",
};

function departmentLabel(code?: string): string | undefined {
  if (!code) return undefined;
  return DEPARTMENT_LABELS[code] ?? code;
}

// The 3 folders explicitly asked for, plus a TnP Cell folder (a separate
// administrative unit, not an academic department — shouldn't be lumped
// in with Applied Sciences) and a PAS Department catch-all for Applied
// Sciences faculty and anyone else whose department code doesn't match
// one of the others, so nobody silently disappears from the directory.
type FolderId = "UGCSE" | "UGECE" | "UGMCS" | "TNP" | "OTHER";

const FOLDERS: { id: FolderId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "UGCSE", label: "CSE Department", icon: "hardware-chip-outline" },
  { id: "UGECE", label: "ECE Department", icon: "radio-outline" },
  { id: "UGMCS", label: "MCS Department", icon: "calculator-outline" },
  { id: "TNP", label: "TnP Cell", icon: "briefcase-outline" },
  { id: "OTHER", label: "PAS Department", icon: "ellipsis-horizontal-circle-outline" },
];

function folderFor(department?: string): FolderId {
  if (department === "UGCSE" || department === "UGECE" || department === "UGMCS" || department === "TNP") {
    return department;
  }
  return "OTHER";
}

// HOD/Head first, then regular (non-contractual) faculty, then
// contractual positions, then anything with no designation set yet
// (allowlist-only entries that haven't been assigned one). Alphabetical
// by name within each tier.
function designationRank(designation?: string): number {
  if (!designation) return 3;
  const d = designation.toLowerCase();
  if (d.includes("head") || d.includes("dean")) return 0;
  if (d.includes("contractual")) return 2;
  return 1;
}

function compareFacultyForDisplay(a: FacultyMember, b: FacultyMember): number {
  const rankDiff = designationRank(a.designation) - designationRank(b.designation);
  if (rankDiff !== 0) return rankDiff;
  return a.name.localeCompare(b.name);
}

const FacultyCard = memo(function FacultyCard({ member }: { member: FacultyMember }) {
  const initial = member.name?.trim()?.[0]?.toUpperCase() ?? "?";
  const isLeadership = designationRank(member.designation) === 0;

  const handleEmail = () => {
    Linking.openURL(`mailto:${member.email}`).catch(() => {});
  };

  const handleCall = () => {
    if (member.phone) Linking.openURL(`tel:${member.phone}`).catch(() => {});
  };

  const handleOfficeEmail = () => {
    if (member.roleEmail) Linking.openURL(`mailto:${member.roleEmail}`).catch(() => {});
  };

  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{member.name}</Text>
          {isLeadership && (
            <View style={styles.leadershipBadge}>
              <Text style={styles.leadershipBadgeText}>
                {member.designation?.toLowerCase().includes("dean") ? "DEAN" : "HOD"}
              </Text>
            </View>
          )}
        </View>
        {member.shortForm && <Text style={styles.shortForm}>{member.shortForm}</Text>}
        {(member.designation || member.department) && (
          <Text style={styles.subtitle}>
            {[member.designation, departmentLabel(member.department)].filter(Boolean).join(" · ")}
          </Text>
        )}
        {member.officeLocation && (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.metaText}>{member.officeLocation}</Text>
          </View>
        )}
        {member.officeHours && (
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.metaText}>{member.officeHours}</Text>
          </View>
        )}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionButton} onPress={handleEmail}>
            <Ionicons name="mail-outline" size={14} color={colors.primary} />
            <Text style={styles.actionText}>Email</Text>
          </TouchableOpacity>
          {member.phone && (
            <TouchableOpacity style={styles.actionButton} onPress={handleCall}>
              <Ionicons name="call-outline" size={14} color={colors.primary} />
              <Text style={styles.actionText}>Call</Text>
            </TouchableOpacity>
          )}
          {member.roleEmail && (
            <TouchableOpacity style={styles.actionButton} onPress={handleOfficeEmail}>
              <Ionicons name="business-outline" size={14} color={colors.primary} />
              <Text style={styles.actionText}>Office</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
});

// Deliberately a separate, simpler component from FacultyCard rather than
// reusing it — designation/department/officeHours/roleEmail all make
// sense for faculty but not for a student in an informal coordinator
// role, and forcing StudentCoordinator into FacultyMember's shape would
// mean a lot of blank/undefined fields rendered conditionally for no
// real benefit. The "STUDENT" badge (instead of HOD/DEAN) is the visual
// cue that keeps these clearly distinct from actual faculty.
const StudentCoordinatorCard = memo(function StudentCoordinatorCard({
  coordinator,
}: {
  coordinator: StudentCoordinator;
}) {
  const initial = coordinator.name?.trim()?.[0]?.toUpperCase() ?? "?";

  const handleEmail = () => {
    Linking.openURL(`mailto:${coordinator.email}`).catch(() => {});
  };
  const handleCall = () => {
    if (coordinator.phone) Linking.openURL(`tel:${coordinator.phone}`).catch(() => {});
  };

  return (
    <View style={styles.card}>
      <View style={[styles.avatar, styles.studentAvatar]}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{coordinator.name}</Text>
          <View style={styles.studentBadge}>
            <Text style={styles.studentBadgeText}>STUDENT</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          {[coordinator.role, coordinator.branch, coordinator.yearLabel].filter(Boolean).join(" · ")}
        </Text>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionButton} onPress={handleEmail}>
            <Ionicons name="mail-outline" size={14} color={colors.primary} />
            <Text style={styles.actionText}>Email</Text>
          </TouchableOpacity>
          {coordinator.phone && (
            <TouchableOpacity style={styles.actionButton} onPress={handleCall}>
              <Ionicons name="call-outline" size={14} color={colors.primary} />
              <Text style={styles.actionText}>Call</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
});

export default function FacultyDirectoryScreen() {
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [coordinators, setCoordinators] = useState<StudentCoordinator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<FolderId | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToFacultyDirectory((data) => {
      setFaculty(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToTnpCoordinators(setCoordinators);
    return () => unsubscribe();
  }, []);

  const folderCounts = useMemo(() => {
    const counts: Record<FolderId, number> = { UGCSE: 0, UGECE: 0, UGMCS: 0, TNP: 0, OTHER: 0 };
    for (const f of faculty) counts[folderFor(f.department)]++;
    return counts;
  }, [faculty]);

  const inFolder = useMemo(
    () =>
      selectedFolder
        ? faculty.filter((f) => folderFor(f.department) === selectedFolder).sort(compareFacultyForDisplay)
        : [],
    [faculty, selectedFolder],
  );

  // Without this, Android's hardware back button skips straight past this
  // screen's internal folder state and pops the whole Faculty Directory
  // screen off the navigation stack (landing back on Home) — since
  // switching folders here is just useState, not a real stack push, React
  // Navigation has no idea a "sub-screen" is open. Intercepting back while
  // a folder is open and just clearing selectedFolder instead makes back
  // behave the way it looks like it should: one step at a time.
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (selectedFolder) {
          setSelectedFolder(null);
          setSearch("");
          return true; // handled — don't let React Navigation pop the screen
        }
        return false; // no folder open, let the normal back behavior happen
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [selectedFolder]),
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inFolder;
    return inFolder.filter((f) =>
      [f.name, f.department, departmentLabel(f.department), f.designation, f.shortForm].some((field) =>
        field?.toLowerCase().includes(q),
      ),
    );
  }, [inFolder, search]);

  const renderItem = useCallback(
    ({ item }: { item: FacultyMember }) => <FacultyCard member={item} />,
    [],
  );

  // Folder picker — the landing view.
  if (!selectedFolder) {
    return (
      <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <Text style={styles.headerTitle}>Faculty Directory</Text>
          {loading ? (
            <View style={styles.loadingContainer}>
              <LoadingSpinner />
            </View>
          ) : (
            <View style={styles.folderList}>
              {FOLDERS.map((folder) => (
                <TouchableOpacity
                  key={folder.id}
                  style={styles.folderCard}
                  onPress={() => setSelectedFolder(folder.id)}
                >
                  <View style={styles.folderIconWrap}>
                    <Ionicons name={folder.icon} size={24} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.folderLabel}>{folder.label}</Text>
                    <Text style={styles.folderCount}>
                      {folderCounts[folder.id]} {folderCounts[folder.id] === 1 ? "member" : "members"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Inside a folder — same searchable list as before, just scoped.
  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.folderHeaderRow}>
          <TouchableOpacity onPress={() => { setSelectedFolder(null); setSearch(""); }} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.folderHeaderTitle}>
            {FOLDERS.find((f) => f.id === selectedFolder)?.label}
          </Text>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or designation"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {filtered.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyText}>
              {inFolder.length === 0 ? "No faculty in this department yet." : "No matches for that search."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.uid ?? item.email}
            contentContainerStyle={styles.listContent}
            renderItem={renderItem}
            ListFooterComponent={
              selectedFolder === "TNP" && coordinators.length > 0 ? (
                <View style={styles.coordinatorsSection}>
                  <Text style={styles.coordinatorsSectionTitle}>Student Coordinators</Text>
                  {coordinators.map((c) => (
                    <StudentCoordinatorCard key={c.id} coordinator={c} />
                  ))}
                </View>
              ) : null
            }
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { ...typography.h2, color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary },
  listContent: { padding: spacing.lg, gap: spacing.md },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...clayShadowSoft,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { ...typography.h3, color: colors.primary },
  cardBody: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  leadershipBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  leadershipBadgeText: { fontSize: 10, fontWeight: "800", color: colors.surface, letterSpacing: 0.5 },
  studentAvatar: { backgroundColor: colors.success + "30" },
  studentBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  studentBadgeText: { fontSize: 10, fontWeight: "800", color: colors.surface, letterSpacing: 0.5 },
  coordinatorsSection: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.surface },
  coordinatorsSectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  shortForm: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  name: { ...typography.h3, color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  metaText: { fontSize: 12, color: colors.textSecondary },
  actionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 12, color: colors.primary, fontWeight: "600" },
  folderList: { padding: spacing.lg, gap: spacing.md },
  folderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...clayShadowSoft,
  },
  folderIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  folderLabel: { ...typography.h3, color: colors.textPrimary },
  folderCount: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  folderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  folderHeaderTitle: { ...typography.h2, color: colors.textPrimary },
});
