import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../../theme/theme';
import { subscribeToSession, markStudent, finalizeSession, Session, AttendanceStatus } from '../../firebase/attendanceService';
import { DEMO_ROSTER } from '../../data/demoRoster';

type Props = {
  sessionId: string;
  subject: string;
  onFinalized: () => void;
};

export default function LiveRosterScreen({ sessionId, subject, onFinalized }: Props) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToSession(sessionId, setSession);
    return unsubscribe;
  }, [sessionId]);

  const markAs = (uid: string, status: AttendanceStatus) => {
    markStudent(sessionId, uid, status);
  };

  const handleFinalize = () => {
    Alert.alert('Finalize session', 'This locks in attendance for all students. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finalize',
        onPress: async () => {
          await finalizeSession(sessionId);
          onFinalized();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>{subject}</Text>
      <Text style={styles.subtitle}>Mark each student present or absent</Text>

      <FlatList
        data={DEMO_ROSTER}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const status = session?.records?.[item.uid];
          const isPresent = status === 'present';
          const isAbsent = status === 'absent';
          return (
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, isPresent && styles.presentActive]}
                  onPress={() => markAs(item.uid, 'present')}
                >
                  <Ionicons name="checkmark" size={16} color={isPresent ? '#fff' : colors.success} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, isAbsent && styles.absentActive]}
                  onPress={() => markAs(item.uid, 'absent')}
                >
                  <Ionicons name="close" size={16} color={isAbsent ? '#fff' : colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      <TouchableOpacity style={styles.finalizeBtn} onPress={handleFinalize}>
        <Text style={styles.finalizeText}>Finalize Session</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  list: { paddingBottom: spacing.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  presentActive: { backgroundColor: colors.success, borderColor: colors.success },
  absentActive: { backgroundColor: colors.danger, borderColor: colors.danger },
  finalizeBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  finalizeText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
