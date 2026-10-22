import React, { useState, useEffect, useCallback, useMemo, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  BackHandler,
  TouchableOpacity,
  Linking,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { File } from "expo-file-system";
import { getDownloadsDir } from "../utils/downloadsDir";
import { addToWebDownloadHistory } from "../utils/webDownloadHistory";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
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
import {
  ROOT_PATH,
  countLabel,
  describeLocation,
  groupBySubject,
  type Folder,
  type FolderPath,
  type ResourceType,
} from "../utils/resourceFolders";
import { openSafeUrl } from "../utils/safeLink";

const typeColors: Record<Resource["type"], string> = {
  Notes: colors.primary,
  PYQ: colors.danger,
  Slides: colors.warning,
  Assignment: colors.success,
};

const typeIcons: Record<Resource["type"], keyof typeof Ionicons.glyphMap> = {
  Notes: "document-text-outline",
  PYQ: "clipboard-outline",
  Slides: "easel-outline",
  Assignment: "create-outline",
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

const FolderCard = memo(function FolderCard({
  folder,
  icon,
  color,
  onPress,
}: {
  folder: Folder;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.itemCard} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconWrap, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle}>{folder.label}</Text>
        <Text style={[styles.folderMeta, folder.count === 0 && styles.folderMetaEmpty]}>
          {folder.sublabel ? `${folder.sublabel} · ` : ""}
          {countLabel(folder.count)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
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
    openSafeUrl(url).catch(() => {});
  }, []);

  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

  const handleDownload = useCallback(async (item: Resource) => {
    setDownloadingIds((prev) => new Set(prev).add(item.id));
    try {
      if (Platform.OS === "web") {

        window.open(item.fileUrl, "_blank");
        await addToWebDownloadHistory({ name: item.title, url: item.fileUrl });
        return;
      }
      const extMatch = item.fileUrl.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
      const ext = extMatch ? `.${extMatch[1]}` : "";

      const safeName = item.title.replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "_") || "resource";
      const destination = new File(getDownloadsDir(), `${safeName}${ext}`);
      const downloaded = await File.downloadFileAsync(item.fileUrl, destination, {
        idempotent: true,
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

  const mode = effectiveRole === "faculty" ? "faculty" : "student";
  const studentBranch = profile?.branch ?? null;
  const studentSemester = profile?.admissionYear
    ? getCurrentSemester(profile.admissionYear, undefined, profile.program)
    : null;

  const groups = useMemo(() => {
    if (mode === "faculty") return groupBySubject(resources, [], "faculty");
    if (!studentBranch || studentSemester === null) return [];
    const mine = resources.filter(
      (r) => r.branch === studentBranch && r.semester === studentSemester,
    );
    return groupBySubject(mine, semesterSubjects, "student");
  }, [mode, resources, semesterSubjects, studentBranch, studentSemester]);

  const [path, setPath] = useState<FolderPath>(ROOT_PATH);

  const loc = useMemo(() => describeLocation(path, groups, mode), [path, groups, mode]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (loc.parent) {
          setPath(loc.parent);
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [loc.parent]),
  );

  const openFolder = useCallback(
    (folder: Folder) => {
      if (loc.level === "subjects") setPath({ subject: folder.key, type: null, year: null });
      else if (loc.level === "types") setPath({ ...loc.path, type: folder.key as ResourceType, year: null });
      else if (loc.level === "years") setPath({ ...loc.path, year: folder.key });
    },
    [loc.level, loc.path],
  );

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

  if (mode === "student" && !(profile?.branch && profile?.admissionYear)) {
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

  const subtitle =
    mode === "faculty"
      ? "Everything posted, across all subjects"
      : profile?.section
        ? `${studentBranch} · Semester ${studentSemester} · Section ${profile.section}`
        : `${studentBranch} · Semester ${studentSemester}`;

  const folderStyle = (folder: Folder): { icon: keyof typeof Ionicons.glyphMap; color: string } => {
    if (loc.level === "subjects") return { icon: "folder-outline", color: colors.primary };
    if (loc.level === "types") {
      const type = folder.key as ResourceType;
      return { icon: typeIcons[type], color: typeColors[type] };
    }
    const type = loc.path.type as ResourceType;
    return { icon: "calendar-outline", color: typeColors[type] };
  };

  const emptyText =
    loc.emptyMessage ??
    (mode === "faculty" ? "No resources uploaded yet." : "No curriculum data for this semester yet.");
  const listKey = [loc.path.subject, loc.path.type, loc.path.year].join("|");

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScreenHeader
          title="Resources"
          subtitle={subtitle}
          actionIcon="download-outline"
          onAction={() => navigation.navigate("MyDownloads")}
        />
        {loadError && (
          <Text style={styles.errorText}>Couldn't load resources: {loadError}</Text>
        )}

        {loc.parent && (
          <TouchableOpacity
            style={styles.crumbBar}
            onPress={() => setPath(loc.parent!)}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color={colors.primary} />
            <Text style={styles.crumbText} numberOfLines={1}>
              {loc.crumbs.join("  ›  ")}
            </Text>
          </TouchableOpacity>
        )}

        {loc.level === "files" ? (
          <FlatList
            key={listKey}
            data={loc.files}
            keyExtractor={(item) => item.id}
            style={styles.listContainer}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            windowSize={7}
            removeClippedSubviews
            ListEmptyComponent={<Text style={styles.emptyText}>No files here.</Text>}
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
        ) : (
          <FlatList
            key={listKey}
            data={loc.folders}
            keyExtractor={(folder) => folder.key}
            style={styles.listContainer}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}
            renderItem={({ item }) => {
              const { icon, color } = folderStyle(item);
              return (
                <FolderCard
                  folder={item}
                  icon={icon}
                  color={color}
                  onPress={() => openFolder(item)}
                />
              );
            }}
          />
        )}

        {mode === "faculty" && (
          <TouchableOpacity
            style={styles.fab}
            onPress={() => navigation.navigate("UploadResource")}
          >
            <Ionicons name="add" size={28} color={colors.surface} />
          </TouchableOpacity>
        )}
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
  listContainer: { flex: 1 },
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
  folderMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  folderMetaEmpty: { fontStyle: "italic" },
  crumbBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  crumbText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
    flex: 1,
  },
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
