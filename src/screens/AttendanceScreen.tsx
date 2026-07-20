import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAttendance, Subject } from '../hooks/useAttendance';

const REQUIRED_PERCENTAGE = 75;

function percentageOf(s: Subject) {
  return s.total > 0 ? Math.round((s.attended / s.total) * 100) : 0;
}

// How many more classes in a row you can miss (or must attend) to hit the requirement.
function bunkAdvice(s: Subject) {
  const pct = percentageOf(s);
  if (s.total === 0) return null;
  if (pct >= REQUIRED_PERCENTAGE) {
    let skips = 0;
    while (true) {
      const newTotal = s.total + skips + 1;
      const newPct = (s.attended / newTotal) * 100;
      if (newPct < REQUIRED_PERCENTAGE) break;
      skips++;
      if (skips > 100) break;
    }
    return skips > 0 ? `Can skip ${skips} more` : 'At the edge — attend next';
  } else {
    let needed = 0;
    while (true) {
      needed++;
      const newTotal = s.total + needed;
      const newAttended = s.attended + needed;
      const newPct = (newAttended / newTotal) * 100;
      if (newPct >= REQUIRED_PERCENTAGE) break;
      if (needed > 200) break;
    }
    return `Attend next ${needed} to recover`;
  }
}

export default function AttendanceScreen() {
  const { subjects, loaded, markClass, setCounts, addSubject, removeSubject, overallPercentage } = useAttendance();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAttended, setEditAttended] = useState('');
  const [editTotal, setEditTotal] = useState('');

  const startEdit = (s: Subject) => {
    setEditingId(s.id);
    setEditAttended(String(s.attended));
    setEditTotal(String(s.total));
  };

  const saveEdit = () => {
    if (editingId) {
      const a = parseInt(editAttended, 10) || 0;
      const t = parseInt(editTotal, 10) || 0;
      setCounts(editingId, Math.min(a, t), t);
    }
    setEditingId(null);
  };

  const submitNewSubject = () => {
    const trimmed = newSubjectName.trim();
    if (trimmed) {
      addSubject(trimmed);
      setNewSubjectName('');
      setAddModalVisible(false);
    }
  };

  if (!loaded) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.loadingText}>Loading attendance…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Attendance</Text>
        <TouchableOpacity onPress={() => setAddModalVisible(true)} style={styles.addIconBtn}>
          <Ionicons name="add" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.overallCard, { backgroundColor: overallPercentage >= REQUIRED_PERCENTAGE ? colors.success : colors.danger }]}>
        <Text style={styles.overallLabel}>Overall Attendance</Text>
        <Text style={styles.overallValue}>{overallPercentage}%</Text>
        <Text style={styles.overallSub}>Requirement: {REQUIRED_PERCENTAGE}%</Text>
      </View>

      <FlatList
        data={subjects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No subjects yet. Tap + to add one.</Text>}
        renderItem={({ item }) => {
          const pct = percentageOf(item);
          const safe = pct >= REQUIRED_PERCENTAGE;
          const isEditing = editingId === item.id;
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.subjectName}>{item.name}</Text>
                <TouchableOpacity onPress={() => removeSubject(item.id)}>
                  <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: safe ? colors.success : colors.danger }]} />
              </View>

              <View style={styles.statsRow}>
                {isEditing ? (
                  <View style={styles.editRow}>
                    <TextInput
                      style={styles.editInput}
                      keyboardType="numeric"
                      value={editAttended}
                      onChangeText={setEditAttended}
                      placeholder="Attended"
                    />
                    <Text style={styles.slash}>/</Text>
                    <TextInput
                      style={styles.editInput}
                      keyboardType="numeric"
                      value={editTotal}
                      onChangeText={setEditTotal}
                      placeholder="Total"
                    />
                    <TouchableOpacity onPress={saveEdit} style={styles.saveBtn}>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => startEdit(item)}>
                    <Text style={styles.statsText}>
                      {item.attended}/{item.total} classes · <Text style={{ color: safe ? colors.success : colors.danger, fontWeight: '700' }}>{pct}%</Text>
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {item.total > 0 && (
                <Text style={styles.advice}>{bunkAdvice(item)}</Text>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity style={[styles.actionBtn, styles.presentBtn]} onPress={() => markClass(item.id, true)}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                  <Text style={[styles.actionText, { color: colors.success }]}>Present</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.absentBtn]} onPress={() => markClass(item.id, false)}>
                  <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
                  <Text style={[styles.actionText, { color: colors.danger }]}>Absent</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => setAddModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Subject</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Operating Systems"
              placeholderTextColor={colors.textSecondary}
              value={newSubjectName}
              onChangeText={setNewSubjectName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAddModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={submitNewSubject}>
                <Text style={styles.modalSaveText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  loadingText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary },
  addIconBtn: {
    width: 36, height: 36, borderRadius: radius.full, backgroundColor: '#EAF0FB',
    alignItems: 'center', justifyContent: 'center',
  },
  overallCard: { borderRadius: radius.md, padding: spacing.lg, alignItems: 'center', marginBottom: spacing.md },
  overallLabel: { color: '#fff', ...typography.body, opacity: 0.9 },
  overallValue: { color: '#fff', fontSize: 36, fontWeight: '700', marginTop: spacing.xs },
  overallSub: { color: '#fff', ...typography.caption, opacity: 0.85, marginTop: spacing.xs },
  list: { paddingBottom: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  subjectName: { ...typography.h3, color: colors.textPrimary, flex: 1 },
  progressBarTrack: { height: 8, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden', marginBottom: spacing.sm },
  progressBarFill: { height: '100%', borderRadius: radius.full },
  statsRow: { marginBottom: spacing.xs },
  statsText: { ...typography.body, color: colors.textPrimary },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  editInput: {
    width: 60, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingVertical: 4, paddingHorizontal: spacing.sm, color: colors.textPrimary, textAlign: 'center',
  },
  slash: { color: colors.textSecondary },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, padding: 6, marginLeft: spacing.xs },
  advice: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm, fontStyle: 'italic' },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm, borderRadius: radius.sm, gap: spacing.xs, borderWidth: 1,
  },
  presentBtn: { borderColor: colors.success, backgroundColor: '#EAF9EF' },
  absentBtn: { borderColor: colors.danger, backgroundColor: '#FCEAEB' },
  actionText: { fontWeight: '600', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, width: '100%' },
  modalTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  modalInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, color: colors.textPrimary, marginBottom: spacing.md,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  modalCancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600' },
  modalSaveBtn: { backgroundColor: colors.primary, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  modalSaveText: { color: '#fff', fontWeight: '600' },
});
