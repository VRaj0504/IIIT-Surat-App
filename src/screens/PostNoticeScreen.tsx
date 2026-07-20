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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { createNotice, updateNotice, deleteNotice, Notice } from '../firebase/noticesService';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type PostNoticeRoute = RouteProp<RootStackParamList, 'PostNotice'>;

// Categories a faculty member can pick from when posting a general notice
// (not tied to a specific club).
const GENERAL_CATEGORIES: Notice['category'][] = ['Academic', 'Placement', 'Event', 'General'];

export default function PostNoticeScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<PostNoticeRoute>();
  const { clubId, clubName, editingNotice } = route.params ?? {};
  const { user, profile } = useAuth();

  const isClubNotice = !!clubId && !!clubName;
  const isEditing = !!editingNotice;

  const [title, setTitle] = useState(editingNotice?.title ?? '');
  const [description, setDescription] = useState(editingNotice?.description ?? '');
  const [link, setLink] = useState(editingNotice?.link ?? '');
  const [category, setCategory] = useState<Notice['category']>(
    editingNotice?.category ?? (isClubNotice ? 'Club' : 'General')
  );
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePost = async () => {
    setError(null);
    if (!title.trim() || !description.trim()) {
      setError('Fill in a title and description.');
      return;
    }
    if (!user || !profile) {
      setError('You must be signed in to post a notice.');
      return;
    }
    setLoading(true);
    try {
      if (isEditing) {
        await updateNotice(editingNotice.id, title.trim(), description.trim(), link.trim());
      } else {
        await createNotice(
          title.trim(),
          description.trim(),
          category,
          user.uid,
          profile.name,
          isClubNotice ? { id: clubId!, name: clubName! } : undefined,
          link.trim() || undefined
        );
      }
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!editingNotice) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteNotice(editingNotice.id);
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{isEditing ? 'Edit Notice' : 'Post Notice'}</Text>
          <Text style={styles.subtitle}>{isClubNotice ? clubName : 'Campus-wide'}</Text>

          {error && <Text style={styles.error}>{error}</Text>}

          {!isClubNotice && !isEditing && (
            <>
              <Text style={styles.label}>Category</Text>
              <View style={styles.categoryRow}>
                {GENERAL_CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.categoryChip, category === c && styles.categoryChipActive]}
                    onPress={() => setCategory(c)}
                  >
                    <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextActive]}>
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="Mid-sem exam schedule released"
            placeholderTextColor={colors.textSecondary}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Details students need to know..."
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />

          <Text style={styles.label}>Drive Link (optional — timetable, syllabus, midsem schedule, etc.)</Text>
          <TextInput
            style={styles.input}
            placeholder="https://drive.google.com/..."
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            keyboardType="url"
            value={link}
            onChangeText={setLink}
          />

          <TouchableOpacity style={styles.primaryBtn} onPress={handlePost} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{isEditing ? 'Save Changes' : 'Post Notice'}</Text>}
          </TouchableOpacity>

          {isEditing && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={deleting}>
              {deleting ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.deleteBtnText}>Delete Notice</Text>}
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, padding: spacing.lg },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.primary, fontWeight: '600', marginBottom: spacing.lg },
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
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  categoryChipTextActive: { color: '#fff' },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteBtn: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteBtnText: { color: colors.danger, fontWeight: '700', fontSize: 16 },
});
