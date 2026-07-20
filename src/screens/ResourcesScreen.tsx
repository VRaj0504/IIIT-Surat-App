import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { subscribeToResources, deleteResource, Resource } from '../firebase/resourceService';
import { getCurrentSemester } from '../utils/academicInfo';
import { subscribeToCurriculum, CurriculumSubject } from '../firebase/curriculumService';
import type { RootStackParamList } from '../navigation/types';

const typeColors: Record<Resource['type'], string> = {
  Notes: colors.primary,
  PYQ: colors.danger,
  Slides: colors.warning,
};

const typeIcons: Record<Resource['type'], keyof typeof Ionicons.glyphMap> = {
  Notes: 'document-text-outline',
  PYQ: 'help-circle-outline',
  Slides: 'easel-outline',
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ResourcesScreen() {
  const { profile } = useAuth();
  const navigation = useNavigation<NavigationProp>();

  const [resources, setResources] = useState<Resource[]>([]);
  const [semesterSubjects, setSemesterSubjects] = useState<CurriculumSubject[]>([]);
const [curriculumLoading, setCurriculumLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  

  useEffect(() => {
    const unsubscribe = subscribeToResources((data) => {
      setResources(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
  if (!profile?.branch || !profile?.admissionYear) {
    setCurriculumLoading(false);
    return;
  }
  const semester = getCurrentSemester(profile.admissionYear);
  const unsubscribe = subscribeToCurriculum(profile.branch, semester, (subjects) => {
    setSemesterSubjects(subjects);
    setCurriculumLoading(false);
  });
  return () => unsubscribe();
}, [profile?.branch, profile?.admissionYear]);

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const handleDelete = (item: Resource) => {
    Alert.alert(
      'Delete resource?',
      `"${item.title}" will be permanently removed for everyone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteResource(item);
            } catch (err: any) {
              Alert.alert('Delete failed', err.message ?? 'Something went wrong.');
            }
          },
        },
      ]
    );
  };

  const renderResourceRow = (item: Resource) => (
    <TouchableOpacity key={item.id} style={styles.itemCard} onPress={() => openLink(item.fileUrl)}>
      <View style={[styles.iconWrap, { backgroundColor: typeColors[item.type] + '20' }]}>
        <Ionicons name={typeIcons[item.type]} size={18} color={typeColors[item.type]} />
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={[styles.itemType, { color: typeColors[item.type] }]}>
          {item.type} · {item.branch} · Sem {item.semester}
        </Text>
      </View>
      {profile?.uid === item.uploadedBy ? (
        <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      ) : (
        <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
      )}
    </TouchableOpacity>
  );

  if (loading || curriculumLoading ) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Faculty see everything they/others have posted, grouped by whatever
  // subject names appear in the data — same as before.
  if (profile?.role === 'faculty') {
    const groupedBySubject = resources.reduce<Record<string, Resource[]>>((acc, item) => {
      if (!acc[item.subject]) acc[item.subject] = [];
      acc[item.subject].push(item);
      return acc;
    }, {});

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.title}>Resources</Text>
        <Text style={styles.subtitle}>Everything posted, across all subjects</Text>
        <ScrollView contentContainerStyle={styles.list}>
          {Object.keys(groupedBySubject).length === 0 && (
            <Text style={styles.emptyText}>No resources uploaded yet.</Text>
          )}
          {Object.entries(groupedBySubject).map(([subject, items]) => (
            <View key={subject} style={styles.subjectSection}>
              <Text style={styles.subjectName}>{subject}</Text>
              {items.map(renderResourceRow)}
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('UploadResource')}>
          <Ionicons name="add" size={28} color={colors.surface} />
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  
  const hasAcademicInfo = profile?.branch && profile?.admissionYear;

if (!hasAcademicInfo) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Resources</Text>
      <Text style={styles.emptyText}>
        Your branch/admission year haven't been set up yet — contact an admin.
      </Text>
    </SafeAreaView>
  );
}

const branch = profile.branch!;
const semester = getCurrentSemester(profile.admissionYear!);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Resources</Text>
      <Text style={styles.subtitle}>
  {branch} · Semester {semester}
</Text>

      <ScrollView contentContainerStyle={styles.list}>
        {semesterSubjects.length === 0 && (
          <Text style={styles.emptyText}>No curriculum data for this semester yet.</Text>
        )}

        {semesterSubjects.map((subject) => {
          // Matching by name, case-insensitive, since faculty type the
          // subject as free text when uploading — not by code.
          const matches = resources.filter(
  (r) =>
    r.branch === branch &&
    r.semester === semester &&
    r.subject.trim().toLowerCase() === subject.name.trim().toLowerCase()
);

          return (
            <View key={subject.code} style={styles.subjectSection}>
              <Text style={styles.subjectName}>{subject.name}</Text>
              <Text style={styles.subjectCode}>{subject.code}</Text>
              {matches.length === 0 ? (
                <Text style={styles.emptySubjectText}>No materials posted yet.</Text>
              ) : (
                matches.map(renderResourceRow)
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  list: { paddingBottom: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  emptySubjectText: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  subjectSection: { marginBottom: spacing.lg },
  subjectName: { ...typography.h3, color: colors.textPrimary },
  subjectCode: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: { flex: 1 },
  itemTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  itemType: { ...typography.caption, fontWeight: '700', marginTop: 2 },
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
});