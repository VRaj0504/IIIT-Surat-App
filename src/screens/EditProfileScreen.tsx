import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { profile, updateProfileName } = useAuth();
  const [name, setName] = useState(profile?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      await updateProfileName(name);
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={colors.textSecondary}
        />

        {/* Read-only fields — these come from the roster/allowlist and admin
            records, not something the app lets you self-edit. */}
        <Text style={styles.label}>Email</Text>
        <View style={styles.readOnlyField}>
          <Text style={styles.readOnlyText}>{profile?.email}</Text>
        </View>

        {profile?.role === 'student' && (
          <>
            <Text style={styles.label}>Enrollment Number</Text>
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyText}>{profile?.enrollmentNumber}</Text>
            </View>
            <Text style={styles.hint}>
              Enrollment number, branch, and section come from the official roster and can't be changed here —
              contact an admin if any of this is wrong.
            </Text>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  label: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  readOnlyField: {
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  readOnlyText: { ...typography.body, color: colors.textSecondary },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
  error: {
    color: colors.danger,
    backgroundColor: '#FCEAEB',
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.md,
    ...typography.caption,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
