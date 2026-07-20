import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme/theme';

type Course = { id: string; credits: string; grade: string };
type Semester = { id: string; sgpa: string; credits: string };

const gradePoints: Record<string, number> = {
  O: 10, 'A+': 9, A: 8, 'B+': 7, B: 6, C: 5, P: 4, F: 0,
};

let idCounter = 1;
const newCourse = (): Course => ({ id: String(idCounter++), credits: '', grade: '' });
const newSemester = (): Semester => ({ id: String(idCounter++), sgpa: '', credits: '' });

export default function CGPACalculatorScreen() {
  // --- Section 1: SGPA for the current semester, from individual courses ---
  const [courses, setCourses] = useState<Course[]>([newCourse(), newCourse(), newCourse()]);

  const sgpa = useMemo(() => {
    let totalCredits = 0;
    let totalPoints = 0;
    for (const c of courses) {
      const credits = parseFloat(c.credits);
      const grade = c.grade.toUpperCase().trim();
      if (!isNaN(credits) && credits > 0 && grade in gradePoints) {
        totalCredits += credits;
        totalPoints += credits * gradePoints[grade];
      }
    }
    return totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '—';
  }, [courses]);

  const updateCourse = (id: string, field: 'credits' | 'grade', value: string) => {
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };
  const addCourse = () => setCourses((prev) => [...prev, newCourse()]);
  const removeCourse = (id: string) => setCourses((prev) => prev.filter((c) => c.id !== id));

  // --- Section 2: overall CGPA, from each completed semester's SGPA + credits ---
  const [semesters, setSemesters] = useState<Semester[]>([newSemester(), newSemester()]);

  const cgpa = useMemo(() => {
    let totalCredits = 0;
    let totalPoints = 0;
    for (const s of semesters) {
      const sgpaVal = parseFloat(s.sgpa);
      const credits = parseFloat(s.credits);
      if (!isNaN(sgpaVal) && sgpaVal >= 0 && sgpaVal <= 10 && !isNaN(credits) && credits > 0) {
        totalCredits += credits;
        totalPoints += credits * sgpaVal;
      }
    }
    return totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '—';
  }, [semesters]);

  const updateSemester = (id: string, field: 'sgpa' | 'credits', value: string) => {
    setSemesters((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };
  const addSemester = () => setSemesters((prev) => [...prev, newSemester()]);
  const removeSemester = (id: string) => setSemesters((prev) => prev.filter((s) => s.id !== id));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}>
        {/* ---- SGPA section ---- */}
        <Text style={styles.title}>SGPA — This Semester</Text>
        <Text style={styles.subtitle}>Enter credits and grade for each course (O, A+, A, B+, B, C, P, F)</Text>

        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Your SGPA</Text>
          <Text style={styles.resultValue}>{sgpa}</Text>
        </View>

        {courses.map((course, index) => (
          <View key={course.id} style={styles.courseRow}>
            <Text style={styles.courseIndex}>{index + 1}</Text>
            <TextInput
              style={styles.input}
              placeholder="Credits"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              value={course.credits}
              onChangeText={(v) => updateCourse(course.id, 'credits', v)}
            />
            <TextInput
              style={styles.input}
              placeholder="Grade"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="characters"
              value={course.grade}
              onChangeText={(v) => updateCourse(course.id, 'grade', v)}
            />
            <TouchableOpacity onPress={() => removeCourse(course.id)} style={styles.removeBtn}>
              <Ionicons name="close-circle" size={22} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={styles.addBtn} onPress={addCourse}>
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={styles.addBtnText}>Add Course</Text>
        </TouchableOpacity>

        {/* ---- CGPA section ---- */}
        <Text style={[styles.title, { marginTop: spacing.xl }]}>CGPA — Overall</Text>
        <Text style={styles.subtitle}>Enter the SGPA and total credits for each completed semester</Text>

        <View style={[styles.resultCard, { backgroundColor: colors.accent }]}>
          <Text style={styles.resultLabel}>Your CGPA</Text>
          <Text style={styles.resultValue}>{cgpa}</Text>
        </View>

        {semesters.map((sem, index) => (
          <View key={sem.id} style={styles.courseRow}>
            <Text style={styles.courseIndex}>S{index + 1}</Text>
            <TextInput
              style={styles.input}
              placeholder="SGPA"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              value={sem.sgpa}
              onChangeText={(v) => updateSemester(sem.id, 'sgpa', v)}
            />
            <TextInput
              style={styles.input}
              placeholder="Total Credits"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              value={sem.credits}
              onChangeText={(v) => updateSemester(sem.id, 'credits', v)}
            />
            <TouchableOpacity onPress={() => removeSemester(sem.id)} style={styles.removeBtn}>
              <Ionicons name="close-circle" size={22} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={styles.addBtn} onPress={addSemester}>
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={styles.addBtnText}>Add Semester</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },
  resultCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  resultLabel: { color: '#D6E0F5', ...typography.body },
  resultValue: { color: '#fff', fontSize: 40, fontWeight: '700', marginTop: spacing.xs },
  courseRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  courseIndex: { width: 24, ...typography.body, color: colors.textSecondary },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
  },
  removeBtn: { padding: spacing.xs },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  addBtnText: { color: colors.primary, fontWeight: '600' },
});
