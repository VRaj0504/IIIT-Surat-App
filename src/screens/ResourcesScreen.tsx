import React, { useState, useEffect, useCallback, useMemo, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  ScrollView,
  TextInput,
  BackHandler,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { File } from "expo-file-system";
import Animated, { FadeIn, FadeInRight } from "react-native-reanimated";
import { getDownloadsDir } from "../utils/downloadsDir";
import { addToWebDownloadHistory } from "../utils/webDownloadHistory";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { subscribeToResources, deleteResource, Resource } from "../firebase/resourceService";
import { getCurrentSemester } from "../utils/academicInfo";
import { subscribeToCurriculum, CurriculumSubject } from "../firebase/curriculumService";
import type { RootStackParamList } from "../navigation/types";
import LoadingSpinner from "../components/LoadingSpinner";
import ScreenHeader from "../components/ScreenHeader";
import TapCard from "../components/TapCard";
import {
  TYPE_ORDER,
  TYPE_LABEL,
  countLabel,
  groupBySubject,
  subjectSections,
  type ResourceType,
  type SubjectGroup,
} from "../utils/resourceFolders";
import { openFacultyPortal } from "../utils/portal";
import { openSafeUrl } from "../utils/safeLink";

const NEW_WINDOW_S = 7 * 24 * 60 * 60;

const typeTone: Record<ResourceType, { bg: string; fg: string }> = {
  Notes: colors.tile.blue,
  Slides: colors.tile.yellow,
  Assignment: colors.tile.mint,
  PYQ: colors.tile.peach,
};

const typeIcons: Record<ResourceType, keyof typeof Ionicons.glyphMap> = {
  Notes: "document-text-outline",
  PYQ: "clipboard-outline",
  Slides: "easel-outline",
  Assignment: "create-outline",
};

const SHORT_TYPE: Record<ResourceType, string> = { Notes: "Notes", Slides: "Slides", Assignment: "Assign.", PYQ: "PYQ" };

const CHIP_LABEL: Record<ResourceType, string> = { Notes: "Notes", Slides: "Slides", Assignment: "Assignments", PYQ: "PYQs" };

const tileTones = [colors.tile.blue, colors.tile.mint, colors.tile.peach, colors.tile.lilac, colors.tile.yellow, colors.tile.pink];

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type Filter = ResourceType | "all";

const isNew = (r: Resource) => !!r.createdAt && Date.now() / 1000 - r.createdAt.seconds < NEW_WINDOW_S;

function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w && !/^(and|of|the|for|in|to|&)$/i.test(w));
  const letters = words.slice(0, 2).map((w) => w[0]).join("");
  return (letters || name.slice(0, 2)).toUpperCase();
}

function fileNameFor(item: Resource): string {
  const extMatch = item.fileUrl.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
  const ext = extMatch ? `.${extMatch[1]}` : "";
  const safeName = item.title.replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "_") || "resource";
  return `${safeName}${ext}`;
}

function isSaved(item: Resource): boolean {
  if (Platform.OS === "web") return false;
  try {
    return new File(getDownloadsDir(), fileNameFor(item)).exists;
  } catch {
    return false;
  }
}

function dateLabel(r: Resource): string {
  if (!r.createdAt) return "";
  const d = new Date(r.createdAt.seconds * 1000);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const TypePill = memo(function TypePill({ type, examYear }: { type: ResourceType; examYear?: number | null }) {
  const tone = typeTone[type];
  return (
    <View style={[styles.typePill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.typePillText, { color: tone.fg }]}>
        {type === "PYQ" && examYear ? `PYQ ${examYear}` : SHORT_TYPE[type]}
      </Text>
    </View>
  );
});

const ResourceRow = memo(function ResourceRow({
  item,
  showSubject,
  canDelete,
  downloading,
  saved,
  onOpen,
  onDownload,
  onDelete,
}: {
  item: Resource;
  showSubject: boolean;
  canDelete: boolean;
  downloading: boolean;
  saved: boolean;
  onOpen: (url: string) => void;
  onDownload: (item: Resource) => void;
  onDelete: (item: Resource) => void;
}) {
  const meta = [showSubject ? item.subject : null, item.uploadedByName || null, dateLabel(item) || null]
    .filter(Boolean)
    .join(" · ");
  return (
    <TapCard style={styles.row} onPress={() => onOpen(item.fileUrl)} accessibilityRole="button" accessibilityLabel={`Open ${item.title}`}>
      <TypePill type={item.type} examYear={item.examYear} />
      <View style={styles.rowInfo}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {isNew(item) && <View style={styles.newDot} accessibilityLabel="New" />}
        </View>
        {!!meta && (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {meta}
          </Text>
        )}
      </View>
      <TouchableOpacity
        style={[styles.dlBtn, saved && styles.dlBtnSaved]}
        onPress={() => (saved ? onOpen(item.fileUrl) : onDownload(item))}
        disabled={downloading}
        accessibilityLabel={saved ? `${item.title} is saved` : `Download ${item.title}`}
      >
        {downloading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : saved ? (
          <Ionicons name="checkmark" size={18} color={colors.onPrimary} />
        ) : (
          <Ionicons name="download-outline" size={19} color={colors.primary} />
        )}
      </TouchableOpacity>
      {canDelete && (
        <TouchableOpacity style={styles.delBtn} onPress={() => onDelete(item)} accessibilityLabel={`Delete ${item.title}`}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      )}
    </TapCard>
  );
});

const SubjectTile = memo(function SubjectTile({
  group,
  index,
  onPress,
}: {
  group: SubjectGroup;
  index: number;
  onPress: () => void;
}) {
  const tone = tileTones[index % tileTones.length];
  const fresh = group.items.filter(isNew).length;
  return (
    <TapCard style={styles.tile} onPress={onPress} haptic="light" accessibilityRole="button" accessibilityLabel={`${group.name}, ${countLabel(group.items.length)}`}>
      <View style={styles.tileTop}>
        <View style={[styles.tileBadge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.tileBadgeText, { color: tone.fg }]}>{initials(group.name)}</Text>
        </View>
        {fresh > 0 && (
          <View style={styles.newPill}>
            <Text style={styles.newPillText}>{fresh} new</Text>
          </View>
        )}
      </View>
      <Text style={styles.tileName} numberOfLines={3}>
        {group.name}
      </Text>
      <Text style={[styles.tileCount, group.items.length === 0 && styles.tileCountEmpty]}>
        {group.code ? `${group.code} · ` : ""}
        {countLabel(group.items.length)}
      </Text>
    </TapCard>
  );
});

const RecentCard = memo(function RecentCard({ item, onOpen }: { item: Resource; onOpen: (url: string) => void }) {
  return (
    <TapCard style={styles.recent} onPress={() => onOpen(item.fileUrl)} accessibilityRole="button" accessibilityLabel={`Open ${item.title}`}>
      <TypePill type={item.type} examYear={item.examYear} />
      <Text style={styles.recentTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.recentMeta} numberOfLines={1}>
        {item.subject} · {dateLabel(item)}
      </Text>
    </TapCard>
  );
});

export default function ResourcesScreen() {
  const { profile, previewRole } = useAuth();
  const effectiveRole = previewRole ?? profile?.role;
  const navigation = useNavigation<NavigationProp>();

  const [resources, setResources] = useState<Resource[]>([]);
  const [semesterSubjects, setSemesterSubjects] = useState<CurriculumSubject[]>([]);
  const [curriculumLoading, setCurriculumLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const scope =
      effectiveRole !== "faculty" && profile?.branch && profile?.admissionYear
        ? {
            branch: profile.branch,
            semester: getCurrentSemester(profile.admissionYear, undefined, profile.program),
            section: profile.section ?? null,
          }
        : undefined;
    setLoading(true);
    setLoadError(null);
    const unsubscribe = subscribeToResources(
      (data) => {
        setResources(data);
        setLoading(false);
      },
      scope,
      (error) => {
        setLoadError(error.message);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [effectiveRole, profile?.branch, profile?.admissionYear, profile?.section]);

  useEffect(() => {
    if (!profile?.branch || !profile?.admissionYear) {
      setCurriculumLoading(false);
      return;
    }
    const semester = getCurrentSemester(profile.admissionYear, undefined, profile.program);
    const unsubscribe = subscribeToCurriculum(profile.branch, semester, (subjects) => {
      setSemesterSubjects(subjects);
      setCurriculumLoading(false);
    });
    return () => unsubscribe();
  }, [profile?.branch, profile?.admissionYear]);

  const openLink = useCallback((url: string) => {
    openSafeUrl(url).catch(() => {});
  }, []);

  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [savedTick, setSavedTick] = useState(0);

  const handleDownload = useCallback(async (item: Resource) => {
    setDownloadingIds((prev) => new Set(prev).add(item.id));
    try {
      if (Platform.OS === "web") {
        window.open(item.fileUrl, "_blank");
        await addToWebDownloadHistory({ name: item.title, url: item.fileUrl });
        return;
      }
      const destination = new File(getDownloadsDir(), fileNameFor(item));
      await File.downloadFileAsync(item.fileUrl, destination, { idempotent: true });
      setSavedTick((n) => n + 1);
    } catch (err: any) {
      Alert.alert("Couldn't download", err.message ?? "Check your connection and try again.");
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }, []);

  const handleDelete = useCallback((item: Resource) => {
    Alert.alert("Delete resource?", `"${item.title}" will be permanently removed for everyone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteResource(item);
          } catch (err: any) {
            Alert.alert("Delete failed", err.message ?? "Something went wrong.");
          }
        },
      },
    ]);
  }, []);

  const mode = effectiveRole === "faculty" ? "faculty" : "student";
  const studentBranch = profile?.branch ?? null;
  const studentSemester = profile?.admissionYear
    ? getCurrentSemester(profile.admissionYear, undefined, profile.program)
    : null;

  const groups = useMemo(() => {
    if (mode === "faculty") return groupBySubject(resources, [], "faculty");
    if (!studentBranch || studentSemester === null) return [];
    const mine = resources.filter((r) => r.branch === studentBranch && r.semester === studentSemester);
    return groupBySubject(mine, semesterSubjects, "student");
  }, [mode, resources, semesterSubjects, studentBranch, studentSemester]);

  const allFiles = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const [subject, setSubject] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const group = subject ? groups.find((g) => g.name === subject) ?? null : null;
  const q = query.trim().toLowerCase();

  useFocusEffect(
    useCallback(() => {
      setSavedTick((n) => n + 1);
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (q) {
          setQuery("");
          return true;
        }
        if (subject) {
          setSubject(null);
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [q, subject]),
  );

  const savedIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of allFiles) if (isSaved(r)) set.add(r.id);
    return set;
  }, [allFiles, savedTick]);

  const recent = useMemo(
    () =>
      allFiles
        .filter(isNew)
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
        .slice(0, 8),
    [allFiles],
  );

  const results = useMemo(() => {
    if (!q) return [];
    return allFiles
      .filter((r) =>
        [r.title, r.subject, r.type, TYPE_LABEL[r.type], r.examYear ? String(r.examYear) : "", r.uploadedByName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  }, [allFiles, q]);

  const typeCounts = useMemo(() => {
    const items = group?.items ?? [];
    return TYPE_ORDER.map((t) => ({ type: t, count: items.filter((r) => r.type === t).length })).filter((c) => c.count > 0);
  }, [group]);

  const activeFilter: Filter = filter !== "all" && typeCounts.some((c) => c.type === filter) ? filter : "all";

  const sections = useMemo(
    () => (group ? subjectSections(group.items, activeFilter, mode).map((s) => ({ key: s.key, title: s.label, data: s.files })) : []),
    [group, activeFilter, mode],
  );

  const openSubject = useCallback((name: string) => {
    setSubject(name);
    setFilter("all");
  }, []);

  const renderRow = useCallback(
    (item: Resource, showSubject: boolean) => (
      <ResourceRow
        item={item}
        showSubject={showSubject}
        canDelete={profile?.uid === item.uploadedBy}
        downloading={downloadingIds.has(item.id)}
        saved={savedIds.has(item.id)}
        onOpen={openLink}
        onDownload={handleDownload}
        onDelete={handleDelete}
      />
    ),
    [profile?.uid, downloadingIds, savedIds, openLink, handleDownload, handleDelete],
  );

  if (loading || curriculumLoading) {
    return (
      <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <View style={styles.loadingContainer}>
            <LoadingSpinner />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (mode === "student" && !(profile?.branch && profile?.admissionYear)) {
    return (
      <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <Text style={styles.emptyText}>Your branch/admission year haven't been set up yet — contact an admin.</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const subtitle =
    mode === "faculty"
      ? "Everything posted, across all subjects"
      : profile?.section
        ? `${studentBranch} · Semester ${studentSemester} · Section ${profile.section}`
        : `${studentBranch} · Semester ${studentSemester}`;

  const searchBar = (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.textSecondary} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={`Search ${allFiles.length} files`}
        placeholderTextColor={colors.textSecondary}
        style={styles.searchInput}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel="Search resources"
      />
      {!!query && (
        <TouchableOpacity onPress={() => setQuery("")} style={styles.clearBtn} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );

  let body: React.ReactNode;
  if (q) {
    body = (
      <Animated.View key="search" entering={FadeIn.duration(160)} style={styles.flex}>
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.resultLine}>
              {results.length} {results.length === 1 ? "result" : "results"}
            </Text>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>Nothing matches “{query.trim()}”.</Text>}
          renderItem={({ item }) => renderRow(item, true)}
        />
      </Animated.View>
    );
  } else if (group) {
    body = (
      <Animated.View key={`subject-${group.name}`} entering={FadeInRight.duration(220)} style={styles.flex}>
        <TouchableOpacity style={styles.backRow} onPress={() => setSubject(null)} accessibilityLabel="Back to subjects">
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={styles.backText}>All subjects</Text>
        </TouchableOpacity>
        <Text style={styles.subjectTitle}>{group.name}</Text>
        <Text style={styles.subjectMeta}>
          {group.code ? `${group.code} · ` : ""}
          {countLabel(group.items.length)}
        </Text>
        {typeCounts.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
            {[{ type: "all" as Filter, count: group.items.length }, ...typeCounts].map((c) => {
              const on = activeFilter === c.type;
              const label = c.type === "all" ? "All" : CHIP_LABEL[c.type as ResourceType];
              return (
                <TouchableOpacity
                  key={c.type}
                  onPress={() => setFilter(c.type)}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {label} {c.count}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) =>
            sections.length > 1 || activeFilter !== "all" ? <Text style={styles.sectionHeader}>{section.title}</Text> : null
          }
          renderItem={({ item }) => renderRow(item, false)}
          ListEmptyComponent={<Text style={styles.emptyText}>Nothing has been posted for this subject yet.</Text>}
        />
      </Animated.View>
    );
  } else {
    body = (
      <Animated.View key="home" entering={FadeIn.duration(180)} style={styles.flex}>
        <FlatList
          data={groups}
          keyExtractor={(g) => g.name}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              {recent.length > 0 && (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Recently added</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow}>
                    {recent.map((r) => (
                      <RecentCard key={r.id} item={r} onOpen={openLink} />
                    ))}
                  </ScrollView>
                </View>
              )}
              {groups.length > 0 && <Text style={styles.blockTitle}>{mode === "faculty" ? "Subjects" : "Your subjects"}</Text>}
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {mode === "faculty" ? "No resources uploaded yet." : "No curriculum data for this semester yet."}
            </Text>
          }
          renderItem={({ item, index }) => (
            <View style={styles.gridCell}>
              <SubjectTile group={item} index={index} onPress={() => openSubject(item.name)} />
            </View>
          )}
        />
      </Animated.View>
    );
  }

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScreenHeader
          title="Resources"
          subtitle={subtitle}
          actionIcon="download-outline"
          onAction={() => navigation.navigate("MyDownloads")}
        />
        {loadError && <Text style={styles.errorText}>Couldn't load resources: {loadError}</Text>}
        {searchBar}
        {body}
        {mode === "faculty" && !q && (
          <TouchableOpacity style={styles.portalPill} onPress={openFacultyPortal} accessibilityLabel="Upload on the faculty portal">
            <Ionicons name="cloud-upload-outline" size={18} color={colors.onPrimary} />
            <Text style={styles.portalPillText}>Upload on the faculty portal</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md },
  flex: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingBottom: 96 },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl },
  errorText: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: 46,
    paddingLeft: 14,
    paddingRight: 4,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, height: 46, fontSize: 15, color: colors.textPrimary, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null) },
  clearBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  resultLine: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },

  block: { marginBottom: spacing.md },
  blockTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  recentRow: { gap: spacing.sm, paddingRight: spacing.md },
  recent: {
    width: 176,
    padding: 12,
    gap: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recentTitle: { fontSize: 14, lineHeight: 19, fontWeight: "700", color: colors.textPrimary },
  recentMeta: { ...typography.caption, fontSize: 12, color: colors.textSecondary },

  gridRow: { gap: spacing.sm },
  gridCell: { flex: 1, marginBottom: spacing.sm },
  tile: {
    flex: 1,
    minHeight: 136,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...clayShadowSoft,
  },
  tileTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tileBadge: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tileBadgeText: { fontSize: 13, fontWeight: "800" },
  newPill: { paddingHorizontal: 8, height: 22, borderRadius: radius.full, backgroundColor: colors.primary, justifyContent: "center" },
  newPillText: { fontSize: 11.5, fontWeight: "800", color: colors.onPrimary },
  tileName: { marginTop: 12, fontSize: 14.5, lineHeight: 19, fontWeight: "700", color: colors.textPrimary },
  tileCount: { marginTop: "auto", paddingTop: 8, fontSize: 12, fontWeight: "500", color: colors.textSecondary },
  tileCountEmpty: { fontStyle: "italic" },

  backRow: { flexDirection: "row", alignItems: "center", gap: 2, height: 40, marginLeft: -4, alignSelf: "flex-start" },
  backText: { ...typography.caption, fontWeight: "700", color: colors.primary },
  subjectTitle: { ...typography.h2, color: colors.textPrimary },
  subjectMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  chipsScroll: { flexGrow: 0, marginTop: spacing.md, marginHorizontal: -spacing.md },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  chipTextOn: { color: colors.onPrimary },
  sectionHeader: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.textSecondary,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 64,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 6,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typePill: { width: 66, height: 24, paddingHorizontal: 4, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  typePillText: { fontSize: 11, fontWeight: "800" },
  rowInfo: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowTitle: { flexShrink: 1, fontSize: 14.5, lineHeight: 19, fontWeight: "700", color: colors.textPrimary },
  newDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  rowMeta: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
  dlBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  dlBtnSaved: { backgroundColor: colors.primary },
  delBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  portalPill: {
    position: "absolute",
    bottom: spacing.lg,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  portalPillText: { color: colors.onPrimary, fontWeight: "800", fontSize: 14 },
});
