import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { subscribeToClubs, subscribeToAllUpcomingEvents, Club, ClubEvent } from '../firebase/clubsService';
import GlassCard from '../components/GlassCard';
import ClubIconTile from '../components/ClubIconTile';
import { getClubIcon } from '../data/clubIcons';
import ScreenHeader from '../components/ScreenHeader';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

function formatEventDate(timestamp: ClubEvent['dateTime']): string {
  const date = timestamp.toDate();
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
    ' · ' + date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function ClubsScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile } = useAuth();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToClubs((data) => {
      setClubs(data.filter((c) => !c.parentClubId));
      setLoadingClubs(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAllUpcomingEvents((data) => {
      setEvents(data);
      setLoadingEvents(false);
    });
    return unsubscribe;
  }, []);

  const openClub = useCallback(
    (club: Club) => {
      navigation.navigate('ClubDetail', { clubId: club.id, clubName: club.name });
    },
    [navigation],
  );

  const openEventsClub = (event: ClubEvent) => {
    navigation.navigate('ClubDetail', { clubId: event.clubId, clubName: event.clubName });
  };

  // Events and clubs are both admin-authored content lists (not something
  // that grows with concurrent student traffic the way live orders do), so
  // there's no real lag risk here even unvirtualized. The clubs grid still
  // moves to FlatList below since it's genuinely unbounded (no `limit()` on
  // the query) and this comes for free; the events list stays as a plain
  // header since a numColumns grid and a card list can't share one FlatList.
  // Just a taste here — three soonest, no search/filter/grouping — with a
  // "See all" link through to the full browsable list (EventsScreen). A
  // long flat list of every upcoming event across every club was crowding
  // out the actual point of this screen, browsing clubs.
  const PREVIEW_COUNT = 3;

  const EventsSection = (
    <>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Upcoming Events</Text>
        {events.length > 0 && (
          <TouchableOpacity onPress={() => navigation.navigate('Events')}>
            <Text style={styles.seeAllLink}>See all</Text>
          </TouchableOpacity>
        )}
      </View>
      {loadingEvents ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
      ) : events.length === 0 ? (
        <Text style={styles.emptyText}>No upcoming events yet.</Text>
      ) : (
        events.slice(0, PREVIEW_COUNT).map((event) => {
          const { icon, color } = getClubIcon(event.clubName);
          return (
            <GlassCard key={event.id} style={styles.eventCard}>
              <TouchableOpacity style={styles.eventCardInner} onPress={() => openEventsClub(event)} activeOpacity={0.7}>
                <View style={[styles.eventIconWrap, { backgroundColor: color + '22' }]}>
                  <Ionicons name={icon} size={20} color={color} />
                </View>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={[styles.eventClub, { color }]}>{event.clubName}</Text>
                  <Text style={styles.eventDate}>{formatEventDate(event.dateTime)}</Text>
                </View>
              </TouchableOpacity>
            </GlassCard>
          );
        })
      )}
      <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>All Clubs</Text>
      {loadingClubs && (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
      )}
      {!loadingClubs && clubs.length === 0 && (
        <Text style={styles.emptyText}>No clubs yet.</Text>
      )}
    </>
  );

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="Clubs & Events"
          actionIcon={profile?.role === 'faculty' ? 'add' : undefined}
          onAction={profile?.role === 'faculty' ? () => navigation.navigate('CreateClub') : undefined}
        />

        <FlatList
          data={loadingClubs ? [] : clubs}
          keyExtractor={(club) => club.id}
          numColumns={3}
          contentContainerStyle={styles.scrollContent}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={EventsSection}
          renderItem={({ item: club }) => (
            <ClubIconTile name={club.name} onPress={() => openClub(club)} />
          )}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md },
  scrollContent: { paddingBottom: spacing.xl },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  seeAllLink: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  emptyText: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  eventCard: { marginBottom: spacing.sm },
  eventCardInner: { flexDirection: 'row', padding: spacing.md },
  eventIconWrap: {
    width: 40, height: 40, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  eventInfo: { flex: 1 },
  eventTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  eventClub: { ...typography.caption, fontWeight: '600', marginTop: 2 },
  eventDate: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-start' },
  gridRow: { gap: spacing.sm, justifyContent: 'flex-start' },
});