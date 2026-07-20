import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../../theme/theme';
import { useAuth } from '../../context/AuthContext';
import { startSession } from '../../firebase/attendanceService';
import { timetable } from '../../data/sampleData';

type Props = {
  onSessionStarted: (sessionId: string, subject: string) => void;
};

// Unique subject list, same source the student app uses, so both sides agree on names.
const subjects = Array.from(new Set(timetable.flatMap((d) => d.slots.map((s) => s.subject))));

export default function StartSessionScreen({ onSessionStarted }: Props) {
  const { profile, logOut } = useAuth();
  const [starting, setStarting] = useState<string | null>(null);

  const handleStart = async (subject: string) => {
    if (!profile) return;
    setStarting(subject);
    try {
      const sessionId = await startSession(subject, profile.uid, profile.name);
      onSessionStarted(sessionId, subject);
    } catch (err: any) {
      Alert.alert('Could not start session', `${err?.code ?? 'unknown error'}: ${err?.message ?? String(err)}`);
    } finally {
      setStarting(null);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logOut() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Start Attendance</Text>
          <Text style={styles.subtitle}>{profile?.name}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {subjects.map((subject) => (
          <TouchableOpacity
            key={subject}
            style={styles.subjectCard}
            onPress={() => handleStart(subject)}
            disabled={starting !== null}
          >
            <Text style={styles.subjectName}>{subject}</Text>
            <Text style={styles.startText}>
              {starting === subject ? 'Starting…' : 'Start Session →'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logoutBtn: { marginTop: spacing.sm, padding: spacing.xs },
  list: { paddingBottom: spacing.xl },
  subjectCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subjectName: { ...typography.h3, color: colors.textPrimary },
  startText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
});
