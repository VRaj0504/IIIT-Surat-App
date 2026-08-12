import React, { useState, useEffect, useCallback, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Alert,
} from "react-native";
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

const typeColors: Record<Resource["type"], string> = {
  Notes: colors.primary,
  PYQ: colors.danger,
  Slides: colors.warning,
};

const typeIcons: Record<Resource["type"], keyof typeof Ionicons.glyphMap> = {
  Notes: "document-text-outline",
  PYQ: "help-circle-outline",
  Slides: "easel-outline",
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ResourceRow = memo(function ResourceRow({
  item,
  canDelete,
  onOpen,
  onDelete,
}: {
  item: Resource;
  canDelete: boolean;
  onOpen: (url: string) => void;
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
          {item.type} · {item.branch} · Sem {item.semester}
        </Text>
      </View>
      {canDelete ? (
        <TouchableOpacity onPress={() => onDelete(item)} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      ) : (
        <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
      )}
    </TouchableOpacity>
  );
});

export default function ResourcesScreen() {
  const { profile } = useAuth();
  const navigation = useNavigation<NavigationProp>();

  const [resources, setResources] = useState<Resource[]>([]);
  const [semesterSubjects, setSemesterSubjects] = useState<CurriculumSubject[]>(
    [],
  );
  const [curriculumLoading, setCurriculumLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Faculty get the unscoped "everything, across all subjects" view (see
    // the faculty branch below) — everyone else only ever needs their own
    // branch+semester, so scope the query itself instead of pulling the
    // whole college's resource library to every student's phone and
    // filtering client-side (see subscribeToResources's comment).
    const scope =
      profile?.role !== "faculty" && profile?.branch && profile?.admissionYear
        ? { branch: profile.branch, semester: getCurrentSemester(profile.admissionYear) }
        : undefined;
    setLoading(true);
    const unsubscribe = subscribeToResources((data) => {
      setResources(data);
      setLoading(false);
    }, scope);
    return () => unsubscribe();
  }, [profile?.role, profile?.branch, profile?.admissionYear]);

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
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Faculty see everything they/others have posted, grouped by whatever
  // subject names appear in the data — same as before. This is the one
  // truly unbounded list on this screen (whole college's resource library,
  // forever), so it's the one worth virtualizing.
  if (profile?.role === "faculty") {
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
          <Text style={styles.title}>Resources</Text>
          <Text style={styles.subtitle}>
            Everything posted, across all subjects
          </Text>
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
                onOpen={openLink}
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
  const studentSections = semesterSubjects.map((subject) => ({
    title: subject.name,
    code: subject.code,
    // Matching by name, case-insensitive, since faculty type the subject as
    // free text when uploading — not by code.
    data: resources.filter(
      (r) =>
        r.branch === branch &&
        r.semester === semester &&
        r.subject.trim().toLowerCase() === subject.name.trim().toLowerCase(),
    ),
  }));

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.title}>Resources</Text>
        <Text style={styles.subtitle}>
          {branch} · Semester {semester}
        </Text>

        <SectionList
          sections={studentSections}
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
              <Text style={styles.subjectName}>{section.title}</Text>
              <Text style={styles.subjectCode}>{section.code}</Text>
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
              onOpen={openLink}
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
