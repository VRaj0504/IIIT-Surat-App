import React, { useState, useEffect, useCallback, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Linking,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { File, Paths } from "expo-file-system";
import { addToWebDownloadHistory } from "../utils/webDownloadHistory";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  colors,
  spacing,
  radius,
  typography,
  clayShadowSoft,
} from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import {
  subscribeToResources,
  deleteResource,
  Resource,
} from "../firebase/resourceService";
import { getCurrentSemester } from "../utils/academicInfo";
import {
  subscribeToCurriculum,
  CurriculumSubject,
} from "../firebase/curriculumService";
import type { RootStackParamList } from "../navigation/types";
import LoadingSpinner from "../components/LoadingSpinner";
import ScreenHeader from "../components/ScreenHeader";

const typeColors: Record<Resource["type"], string> = {
  Notes: colors.primary,
  PYQ: colors.danger,
  Slides: colors.warning,
};

const typeIcons: Record<Resource["type"], keyof typeof Ionicons.glyphMap> = {
  Notes: "document-text-outline",
  PYQ: "clipboard-outline",
  Slides: "easel-outline",
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ResourceRow = memo(function ResourceRow({
  item,
  canDelete,
  downloading,
  onOpen,
  onDownload,
  onDelete,
}: {
  item: Resource;
  canDelete: boolean;
  downloading: boolean;
  onOpen: (url: string) => void;
  onDownload: (item: Resource) => void;
  onDelete: (item: Resource) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.itemCard}
      onPress={() => onOpen(item.fileUrl)}
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: typeColors[item.type] + "20" },
        ]}
      >
        <Ionicons
          name={typeIcons[item.type]}
          size={18}
          color={typeColors[item.type]}
        />
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={[styles.itemType, { color: typeColors[item.type] }]}>
          {item.type === "PYQ" && item.examYear ? `PYQ ${item.examYear}` : item.type} · {item.branch} · Sem {item.semester}
        </Text>
      </View>
      {/* Downloads the actual file to the device instead of just opening
          it — the previous tap-to-open behavior needs a live connection
          every single time, even to re-view something already seen
          once, which is the whole complaint on patchy campus wifi. This
          is a separate action from the row's own tap-to-open, not a
          replacement for it — opening is still the quick "view it now"
          path when you do have signal. */}
      <TouchableOpacity onPress={() => onDownload(item)} hitSlop={8} disabled={downloading}>
        {downloading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name="download-outline" size={18} color={colors.primary} />
        )}
      </TouchableOpacity>
      {canDelete && (
        <TouchableOpacity onPress={() => onDelete(item)} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

export default function ResourcesScreen() {
  const { profile, previewRole } = useAuth();
  const effectiveRole = previewRole ?? profile?.role;
  const navigation = useNavigation<NavigationProp>();

  const [resources, setResources] = useState<Resource[]>([]);
  const [semesterSubjects, setSemesterSubjects] = useState<CurriculumSubject[]>(
    [],
  );
  const [curriculumLoading, setCurriculumLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // Faculty get the unscoped "everything, across all subjects" view (see
    // the faculty branch below) — everyone else only ever needs their own
    // branch+semester, so scope the query itself instead of pulling the
    // whole college's resource library to every student's phone and
    // filtering client-side (see subscribeToResources's comment).
    const scope =
      effectiveRole !== "faculty" && profile?.branch && profile?.admissionYear
        ? {
            branch: profile.branch,
            semester: getCurrentSemester(profile.admissionYear),
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
    const semester = getCurrentSemester(profile.admissionYear);
    const unsubscribe = subscribeToCurriculum(
      profile.branch,
      semester,
      (subjects) => {
        setSemesterSubjects(subjects);
        setCurriculumLoading(false);
      },
    );
    return () => unsubscribe();
  }, [profile?.branch, profile?.admissionYear]);

  const openLink = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {});
  }, []);

  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

  // item.fileUrl is a direct Firebase Storage download link (see
  // resourceService.ts), not an HTML viewer page — so this fetches the
  // actual file bytes, not just a link to them. Saved into the app's own
  // document directory, which persists across app restarts and needs no
  // internet to re-open later. Opening the saved file (share sheet for
  // PDFs, in-app viewer for images) happens from MyDownloadsScreen.
  const handleDownload = useCallback(async (item: Resource) => {
    setDownloadingIds((prev) => new Set(prev).add(item.id));
    try {
      if (Platform.OS === "web") {
        // No real filesystem to save into on web — opening the URL directly
        // is the actual "download" (the browser handles it: PDFs render
        // in-tab via the browser's own native viewer, other types save via
        // the browser's normal download flow). window.open avoids
        // navigating the app itself away from the current screen.
        window.open(item.fileUrl, "_blank");
        await addToWebDownloadHistory({ name: item.title, url: item.fileUrl });
        return;
      }
      const extMatch = item.fileUrl.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
      const ext = extMatch ? `.${extMatch[1]}` : "";
      const safeName = item.title.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "resource";
      const destination = new File(Paths.document, `${safeName}${ext}`);
      const downloaded = await File.downloadFileAsync(item.fileUrl, destination, {
        idempotent: true, // overwrite rather than fail if downloaded before
      });
      Alert.alert(
        "Downloaded",
        `Saved. Find "${item.title}" any time in Resources → the download icon at the top → My Downloads, even without a connection.`,
      );
    } catch (err: any) {
      Alert.alert(
        "Couldn't download",
        err.message ?? "Check your connection and try again.",
      );
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }, []);

  const handleDelete = useCallback((item: Resource) => {
    Alert.alert(
      "Delete resource?",
      `"${item.title}" will be permanently removed for everyone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteResource(item);
            } catch (err: any) {
              Alert.alert(
                "Delete failed",
                err.message ?? "Something went wrong.",
              );
            }
          },
        },
      ],
    );
  }, []);

  if (loading || curriculumLoading) {
    return (
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={{ flex: 1 }}
      >
        <SafeAreaView style={styles.container} edges={["top"]}>
          <View style={styles.loadingContainer}>
            <LoadingSpinner />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Faculty see everything they/others have posted, grouped by whatever
  // subject names appear in the data — same as before. This is the one
  // truly unbounded list on this screen (whole college's resource library,
  // forever), so it's the one worth virtualizing.
  if (effectiveRole === "faculty") {
    const groupedBySubject = resources.reduce<Record<string, Resource[]>>(
      (acc, item) => {
        if (!acc[item.subject]) acc[item.subject] = [];
        acc[item.subject].push(item);
        return acc;
      },
      {},
    );
    const sections = Object.entries(groupedBySubject).map(
      ([subject, items]) => ({ title: subject, data: items }),
    );

    return (
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={{ flex: 1 }}
      >
        <SafeAreaView style={styles.container} edges={["top"]}>
          <ScreenHeader
            title="Resources"
            subtitle="Everything posted, across all subjects"
            actionIcon="download-outline"
            onAction={() => navigation.navigate("MyDownloads")}
          />
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            windowSize={7}
            removeClippedSubviews
            ListEmptyComponent={
              <Text style={styles.emptyText}>No resources uploaded yet.</Text>
            }
            renderSectionHeader={({ section }) => (
              <Text style={styles.subjectName}>{section.title}</Text>
            )}
            renderItem={({ item }) => (
              <ResourceRow
                item={item}
                canDelete={profile?.uid === item.uploadedBy}
                downloading={downloadingIds.has(item.id)}
                onOpen={openLink}
                onDownload={handleDownload}
                onDelete={handleDelete}
              />
            )}
          />
          <TouchableOpacity
            style={styles.fab}
            onPress={() => navigation.navigate("UploadResource")}
          >
            <Ionicons name="add" size={28} color={colors.surface} />
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const hasAcademicInfo = profile?.branch && profile?.admissionYear;

  if (!hasAcademicInfo) {
    return (
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={{ flex: 1 }}
      >
        <SafeAreaView style={styles.container} edges={["top"]}>
          <Text style={styles.title}>Resources</Text>
          <Text style={styles.emptyText}>
            Your branch/admission year haven't been set up yet — contact an
            admin.
          </Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const branch = profile.branch!;
  const semester = getCurrentSemester(profile.admissionYear!);

  // Bounded by curriculum size (a handful of subjects per semester) with a
  // realistically small number of files per subject, so this list was never
  // at real risk of lag — converted anyway for consistency with the faculty
  // view above and because SectionList costs nothing extra here.
  //
  // Each subject becomes up to TWO sections rather than one flat list:
  // Notes/Slides (newest first, same as before), and — only when at least
  // one PYQ exists for this subject — a separate "Previous Year Papers"
  // section sorted by examYear descending. Mixing every type into one
  // undated pile was the actual complaint: a student hunting for "the
  // 2023 DBMS paper" had to scan past every Notes/Slides upload plus every
  // other year's PYQ in whatever order they happened to be created in.
  const studentSections = semesterSubjects.flatMap((subject) => {
    // Matching by name, case-insensitive, since faculty type the subject as
    // free text when uploading — not by code.
    const subjectResources = resources.filter(
      (r) =>
        r.branch === branch &&
        r.semester === semester &&
        r.subject.trim().toLowerCase() === subject.name.trim().toLowerCase(),
    );
    const materials = subjectResources.filter((r) => r.type !== "PYQ");
    const pyqs = [...subjectResources.filter((r) => r.type === "PYQ")].sort(
      (a, b) => (b.examYear ?? 0) - (a.examYear ?? 0),
    );

    const sections = [
      { title: subject.name, code: subject.code, data: materials, isPyqSection: false },
    ];
    if (pyqs.length > 0) {
      sections.push({
        title: subject.name,
        code: "Previous Year Papers",
        data: pyqs,
        isPyqSection: true,
      });
    }
    return sections;
  });

  // A resource whose `subject` text doesn't match any curriculum subject
  // for this semester — most often something auto-published from the
  // faculty email pipeline, where the subject line comes from free text
  // (an email subject, or nothing at all) rather than a curriculum pick —
  // used to simply vanish here: correctly branch/semester-scoped, but
  // silently excluded from every section above since none of them claimed
  // it. Surfacing it under "Other" means a resource is never invisible
  // just because its subject text doesn't line up with the curriculum.
  const matchedIds = new Set(studentSections.flatMap((s) => s.data.map((r) => r.id)));
  const unmatched = resources.filter(
    (r) => r.branch === branch && r.semester === semester && !matchedIds.has(r.id),
  );
  const allSections =
    unmatched.length > 0
      ? [...studentSections, { title: "Other", code: "", data: unmatched, isPyqSection: false }]
      : studentSections;

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScreenHeader
          title="Resources"
          subtitle={
            profile?.section
              ? `${branch} · Semester ${semester} · Section ${profile.section}`
              : `${branch} · Semester ${semester}`
          }
          actionIcon="download-outline"
          onAction={() => navigation.navigate("MyDownloads")}
        />
        {loadError && (
          <Text style={styles.errorText}>Couldn't load resources: {loadError}</Text>
        )}

        <SectionList
          sections={allSections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No curriculum data for this semester yet.
            </Text>
          }
          renderSectionHeader={({ section }) => (
            <View>
              {!section.isPyqSection && (
                <Text style={styles.subjectName}>{section.title}</Text>
              )}
              <Text style={section.isPyqSection ? styles.pyqSectionLabel : styles.subjectCode}>
                {section.code}
              </Text>
            </View>
          )}
          renderSectionFooter={({ section }) =>
            section.data.length === 0 ? (
              <Text style={styles.emptySubjectText}>
                No materials posted yet.
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <ResourceRow
              item={item}
              canDelete={profile?.uid === item.uploadedBy}
              downloading={downloadingIds.has(item.id)}
              onOpen={openLink}
              onDownload={handleDownload}
              onDelete={handleDelete}
            />
          )}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.sm },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  list: { paddingBottom: spacing.xl },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  emptySubjectText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  subjectSection: { marginBottom: spacing.lg },
  subjectName: { ...typography.h3, color: colors.textPrimary },
  subjectCode: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  pyqSectionLabel: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "700",
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...clayShadowSoft,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: { flex: 1 },
  itemTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  itemType: { ...typography.caption, fontWeight: "700", marginTop: 2 },
  fab: {
    position: "absolute",
    right: spacing.md,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
});
