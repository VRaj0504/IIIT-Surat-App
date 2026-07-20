import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Linking, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { subscribeToClubs, subscribeToClubEvents, setClubLead, revokeClubLeadAccess, deleteEvent, Club, ClubEvent } from '../firebase/clubsService';
import { subscribeToNotices, deleteNotice, Notice } from '../firebase/noticesService';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type DetailRoute = RouteProp<RootStackParamList, 'ClubDetail'>;

function formatEventDate(timestamp: ClubEvent['dateTime']): string {
  const date = timestamp.toDate();
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) +
    ' · ' + date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function ClubDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<DetailRoute>();
  const { clubId, clubName } = route.params;
  const { user, profile } = useAuth();

  const [club, setClub] = useState<Club | null>(null);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [clubNotices, setClubNotices] = useState<Notice[]>([]);
  const [loadingNotices, setLoadingNotices] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const [leadNameInput, setLeadNameInput] = useState('');
  const [leadEmailInput, setLeadEmailInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [seededForClubId, setSeededForClubId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToClubs((clubs) => {
      const match = clubs.find((c) => c.id === clubId);
      setClub(match ?? null);
    });
    return unsubscribe;
  }, [clubId]);

  useEffect(() => {
    const unsubscribe = subscribeToClubEvents(clubId, (data) => {
      setEvents(data);
      setLoadingEvents(false);
    });
    return unsubscribe;
  }, [clubId]);

  useEffect(() => {
    // Reuses the same global notices subscription and filters client-side —
    // avoids needing a composite Firestore index for a where + orderBy combo.
    const unsubscribe = subscribeToNotices((allNotices) => {
      setClubNotices(allNotices.filter((n) => n.clubId === clubId));
      setLoadingNotices(false);
    });
    return unsubscribe;
  }, [clubId]);

  useEffect(() => {
    if (club && seededForClubId !== club.id) {
      setLeadNameInput(club.leadName);
      setLeadEmailInput(club.leadEmail ?? '');
      setSeededForClubId(club.id);
    }
  }, [club, seededForClubId]);

  const isLead = !!user && !!club && user.uid === club.leadUid;
  const isFaculty = profile?.role === 'faculty';

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const handleDeleteEvent = (event: ClubEvent) => {
    Alert.alert('Delete event?', `"${event.title}" will be removed for everyone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteEvent(event.id).catch(() => {}) },
    ]);
  };

  const handleDeleteNotice = (notice: Notice) => {
    Alert.alert('Delete notice?', `"${notice.title}" will be removed for everyone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteNotice(notice.id).catch(() => {}) },
    ]);
  };

  const handleSaveLead = async () => {
    setManageError(null);
    if (!leadNameInput.trim()) {
      setManageError('Lead name is required.');
      return;
    }
    setSaving(true);
    try {
      await setClubLead(clubId, leadNameInput.trim(), leadEmailInput.trim() || undefined);
    } catch (e: any) {
      setManageError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    setManageError(null);
    setRevoking(true);
    try {
      await revokeClubLeadAccess(clubId);
      setLeadEmailInput('');
    } catch (e: any) {
      setManageError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{clubName}</Text>
        {club && (
          <>
            <Text style={styles.category}>{club.category} · Lead: {club.leadName}</Text>
            <Text style={styles.description}>{club.description}</Text>
          </>
        )}
      </View>

      {(isLead || isFaculty) && (
        <View style={styles.postBtnRow}>
          <TouchableOpacity
            style={[styles.postBtn, styles.postBtnHalf]}
            onPress={() => navigation.navigate('PostEvent', { clubId, clubName })}
          >
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.postBtnText}>Post an Event</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.postBtn, styles.postBtnHalf, styles.postBtnSecondary]}
            onPress={() => navigation.navigate('PostNotice', { clubId, clubName })}
          >
            <Ionicons name="megaphone" size={20} color={colors.primary} />
            <Text style={[styles.postBtnText, styles.postBtnTextSecondary]}>Post a Notice</Text>
          </TouchableOpacity>
        </View>
      )}

      {isFaculty && club && (
        <View style={styles.manageCard}>
          <TouchableOpacity style={styles.manageHeader} onPress={() => setManageOpen((v) => !v)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.manageTitle}>Manage Lead</Text>
              <Text style={styles.manageStatus}>
                {club.leadUid
                  ? `${club.leadName} · account linked`
                  : `${club.leadName} · no account linked yet`}
              </Text>
            </View>
            <Ionicons name={manageOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          {manageOpen && (
            <View style={styles.managePanel}>
              {manageError && <Text style={styles.error}>{manageError}</Text>}

              <Text style={styles.manageLabel}>Lead Name</Text>
              <TextInput
                style={styles.linkInput}
                placeholder="Full name"
                placeholderTextColor={colors.textSecondary}
                value={leadNameInput}
                onChangeText={setLeadNameInput}
              />

              <Text style={styles.manageLabel}>Lead's Account Email (optional)</Text>
              <TextInput
                style={styles.linkInput}
                placeholder="lead@iiitsurat.ac.in"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                keyboardType="email-address"
                value={leadEmailInput}
                onChangeText={setLeadEmailInput}
              />
              <Text style={styles.manageHint}>
                Change this to reassign the club to a new lead for the year — enter the new lead's name,
                and their email if they've already signed up. Leave email blank to save name-only.
              </Text>

              <TouchableOpacity style={styles.linkSubmitBtn} onPress={handleSaveLead} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.linkSubmitText}>Save Changes</Text>}
              </TouchableOpacity>

              {!!club.leadUid && (
                <TouchableOpacity style={styles.revokeBtn} onPress={handleRevoke} disabled={revoking}>
                  {revoking ? (
                    <ActivityIndicator color={colors.danger} />
                  ) : (
                    <Text style={styles.revokeBtnText}>Revoke Posting Access</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.sectionTitle}>Notices</Text>
            {loadingNotices ? (
              <ActivityIndicator color={colors.primary} style={{ marginBottom: spacing.md }} />
            ) : clubNotices.length === 0 ? (
              <Text style={[styles.emptyText, { marginBottom: spacing.md }]}>No notices posted yet.</Text>
            ) : (
              clubNotices.map((notice) => (
                <View key={notice.id} style={styles.eventCard}>
                  <Text style={styles.eventTitle}>{notice.title}</Text>
                  <Text style={styles.eventDescription}>{notice.description}</Text>
                  {notice.link && (
                    <TouchableOpacity style={styles.linkBtn} onPress={() => openLink(notice.link!)}>
                      <Ionicons name="document-attach-outline" size={16} color={colors.primary} />
                      <Text style={styles.linkText}>Open attachment</Text>
                    </TouchableOpacity>
                  )}
                  {(user?.uid === notice.createdBy || isFaculty) && (
                    <View style={styles.ownerRow}>
                      {user?.uid === notice.createdBy && (
                        <TouchableOpacity
                          style={styles.ownerBtn}
                          onPress={() => navigation.navigate('PostNotice', { clubId, clubName, editingNotice: notice })}
                        >
                          <Ionicons name="pencil-outline" size={14} color={colors.textSecondary} />
                          <Text style={styles.ownerBtnText}>Edit</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.ownerBtn} onPress={() => handleDeleteNotice(notice)}>
                        <Ionicons name="trash-outline" size={14} color={colors.danger} />
                        <Text style={[styles.ownerBtnText, { color: colors.danger }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
            <Text style={styles.sectionTitle}>Events</Text>
          </View>
        }
        ListEmptyComponent={
          loadingEvents ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
          ) : (
            <Text style={styles.emptyText}>No events posted yet.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.eventCard}>
            <Text style={styles.eventTitle}>{item.title}</Text>
            <Text style={styles.eventDate}>{formatEventDate(item.dateTime)}</Text>
            <Text style={styles.eventDescription}>{item.description}</Text>
            {item.link && (
              <TouchableOpacity style={styles.linkBtn} onPress={() => openLink(item.link!)}>
                <Ionicons name="open-outline" size={16} color={colors.primary} />
                <Text style={styles.linkText}>Open link</Text>
              </TouchableOpacity>
            )}
            {user?.uid === item.createdBy && (
              <View style={styles.ownerRow}>
                <TouchableOpacity
                  style={styles.ownerBtn}
                  onPress={() => navigation.navigate('PostEvent', { clubId, clubName, editingEvent: item })}
                >
                  <Ionicons name="pencil-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.ownerBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ownerBtn} onPress={() => handleDeleteEvent(item)}>
                  <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  <Text style={[styles.ownerBtnText, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  header: { paddingTop: spacing.sm, marginBottom: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary },
  category: { ...typography.caption, color: colors.primary, fontWeight: '600', marginTop: spacing.xs },
  description: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  postBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  postBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  postBtnHalf: {},
  postBtnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  postBtnText: { ...typography.body, color: '#fff', fontWeight: '700' as const },
  postBtnTextSecondary: { color: colors.primary },
  manageCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  manageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  manageTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  manageStatus: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  managePanel: {
    padding: spacing.md,
    paddingTop: 0,
  },
  manageLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  manageHint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.sm },
  linkInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  linkSubmitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  linkSubmitText: { ...typography.caption, color: '#fff', fontWeight: '700' as const },
  revokeBtn: {
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  revokeBtnText: { ...typography.caption, color: colors.danger, fontWeight: '700' as const },
  error: {
    color: colors.danger,
    backgroundColor: '#FCEAEB',
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
    ...typography.caption,
  },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  list: { paddingBottom: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary },
  eventCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventTitle: { ...typography.h3, color: colors.textPrimary },
  eventDate: { ...typography.caption, color: colors.accent, fontWeight: '700', marginTop: 2, marginBottom: spacing.xs },
  eventDescription: { ...typography.body, color: colors.textSecondary },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  linkText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  ownerRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  ownerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ownerBtnText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
});
