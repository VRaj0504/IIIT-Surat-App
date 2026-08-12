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
  const EventsSection = (
    <>
      <Text style={styles.sectionTitle}>Upcoming Events</Text>
      {loadingEvents ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
      ) : events.length === 0 ? (
        <Text style={styles.emptyText}>No upcoming events yet.</Text>
      ) : (
        events.map((event) => {
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
        <View style={styles.headerRow}>
          <Text style={styles.title}>Clubs & Events</Text>
          {profile?.role === 'faculty' && (
            <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('CreateClub')}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { ...typography.h1, color: colors.textPrimary },
  addBtn: {
    width: 36, height: 36, borderRadius: radius.full,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  scrollContent: { paddingBottom: spacing.xl },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
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