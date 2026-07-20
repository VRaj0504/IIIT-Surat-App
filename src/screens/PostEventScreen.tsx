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
import { createEvent, updateEvent, deleteEvent } from '../firebase/clubsService';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type PostEventRoute = RouteProp<RootStackParamList, 'PostEvent'>;

export default function PostEventScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<PostEventRoute>();
  const { clubId, clubName, editingEvent } = route.params;
  const { user, profile } = useAuth();
  const isEditing = !!editingEvent;

  const [title, setTitle] = useState(editingEvent?.title ?? '');
  const [description, setDescription] = useState(editingEvent?.description ?? '');
  const [dateText, setDateText] = useState(
    editingEvent ? editingEvent.dateTime.toDate().toISOString().slice(0, 10) : ''
  ); // e.g. 2026-07-20
  const [timeText, setTimeText] = useState(
    editingEvent ? editingEvent.dateTime.toDate().toTimeString().slice(0, 5) : ''
  ); // e.g. 18:00
  const [link, setLink] = useState(editingEvent?.link ?? '');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePost = async () => {
    setError(null);
    if (!title.trim() || !description.trim() || !dateText.trim() || !timeText.trim()) {
      setError('Fill in title, description, date, and time.');
      return;
    }
    const dateTime = new Date(`${dateText.trim()}T${timeText.trim()}:00`);
    if (isNaN(dateTime.getTime())) {
      setError('Date must be YYYY-MM-DD and time must be HH:MM (24-hour).');
      return;
    }
    if (!user || !profile) {
      setError('You must be signed in to post an event.');
      return;
    }
    setLoading(true);
    try {
      if (isEditing) {
        await updateEvent(editingEvent.id, title.trim(), description.trim(), dateTime, link.trim());
      } else {
        await createEvent(
          clubId,
          clubName,
          title.trim(),
          description.trim(),
          dateTime,
          link.trim(),
          user.uid,
          profile.name
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
    if (!editingEvent) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteEvent(editingEvent.id);
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
          <Text style={styles.title}>{isEditing ? 'Edit Event' : 'Post Event'}</Text>
          <Text style={styles.subtitle}>{clubName}</Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <Text style={styles.label}>Event Title</Text>
          <TextInput
            style={styles.input}
            placeholder="Codeforces Div 2 Prep Session"
            placeholderTextColor={colors.textSecondary}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="What's happening, who should attend..."
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Date</Text>
              <TextInput
                style={styles.input}
                placeholder="2026-07-20"
                placeholderTextColor={colors.textSecondary}
                value={dateText}
                onChangeText={setDateText}
              />
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Time (24h)</Text>
              <TextInput
                style={styles.input}
                placeholder="18:00"
                placeholderTextColor={colors.textSecondary}
                value={timeText}
                onChangeText={setTimeText}
              />
            </View>
          </View>

          <Text style={styles.label}>Drive / Registration Link (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="https://forms.gle/..."
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            keyboardType="url"
            value={link}
            onChangeText={setLink}
          />

          <TouchableOpacity style={styles.primaryBtn} onPress={handlePost} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{isEditing ? 'Save Changes' : 'Post Event'}</Text>}
          </TouchableOpacity>

          {isEditing && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={deleting}>
              {deleting ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.deleteBtnText}>Delete Event</Text>}
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
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowItem: { flex: 1 },
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
