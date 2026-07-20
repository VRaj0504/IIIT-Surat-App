import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, radius, typography } from '../theme/theme';
import { createClub } from '../firebase/clubsService';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function CreateClubScreen() {
  const navigation = useNavigation<NavProp>();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setError(null);
    if (!name.trim() || !category.trim() || !description.trim() || !leadName.trim()) {
      setError('Fill in name, category, description, and lead name.');
      return;
    }
    setLoading(true);
    try {
      await createClub(name.trim(), category.trim(), description.trim(), leadName.trim(), leadEmail.trim() || undefined);
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>New Club</Text>
          <Text style={styles.subtitle}>Set up a club and assign its lead</Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <Text style={styles.label}>Club Name</Text>
          <TextInput
            style={styles.input}
            placeholder="LCS (Learn Code Solve)"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Category</Text>
          <TextInput
            style={styles.input}
            placeholder="Technical, Cultural, Sports..."
            placeholderTextColor={colors.textSecondary}
            value={category}
            onChangeText={setCategory}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="What does this club do?"
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.label}>Lead's Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor={colors.textSecondary}
            value={leadName}
            onChangeText={setLeadName}
          />

          <Text style={styles.label}>Lead's Account Email (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="lead@iiitsurat.ac.in"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            value={leadEmail}
            onChangeText={setLeadEmail}
          />
          <Text style={styles.hint}>
            Leave blank if the lead doesn't have a name yet. If you enter an email but they
            haven't signed up in the app, that's fine — the club will auto-link to their account
            the moment they sign up with that exact email. No account yet? No problem.
          </Text>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleCreate} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create Club</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, padding: spacing.lg },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
  error: {
    color: colors.danger,
    backgroundColor: '#FCEAEB',
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
    ...typography.caption,
  },
  label: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
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
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
