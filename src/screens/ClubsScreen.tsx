import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { subscribeToClubs, subscribeToAllUpcomingEvents, Club, ClubEvent } from '../firebase/clubsService';
import { getClubIcon } from '../data/clubIcons';
import LoadingSpinner from '../components/LoadingSpinner';
import TapCard from '../components/TapCard';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const EVENT_TONES: (keyof typeof colors.tile)[] = ['lilac', 'peach', 'mint', 'blue', 'pink', 'yellow'];

function eventWhen(ts: ClubEvent['dateTime']): string {
  const d = ts.toDate();
  const today = new Date();
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86400000,
  );
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (days === 0) return `Today · ${time}`;
  if (days === 1) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString('en-IN', { weekday: 'short' })} · ${time}`;
}

export default function ClubsScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile } = useAuth();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

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

  const openClub = (clubId: string, clubName: string) => navigation.navigate('ClubDetail', { clubId, clubName });

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(clubs.map((c) => c.category).filter(Boolean))).sort()],
    [clubs],
  );
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clubs.filter(
      (c) => (category === 'All' || c.category === category) && (!q || c.name.toLowerCase().includes(q)),
    );
  }, [clubs, search, category]);

  const Header = (
    <>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Coming up</Text>
        {events.length > 0 && (
          <TouchableOpacity onPress={() => navigation.navigate('Events')} hitSlop={8}>
            <Text style={styles.link}>All events</Text>
          </TouchableOpacity>
        )}
      </View>
      {loadingEvents ? (
        <LoadingSpinner variant="dots" style={{ marginVertical: spacing.md }} />
      ) : events.length === 0 ? (
        <View style={styles.emptyEvents}>
          <Ionicons name="calendar-clear-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No upcoming events yet.</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.eventsWrap}
          contentContainerStyle={styles.events}
        >
          {events.slice(0, 8).map((event, i) => {
            const tone = colors.tile[EVENT_TONES[i % EVENT_TONES.length]];
            const d = event.dateTime.toDate();
            return (
              <TapCard
                key={event.id}
                style={[styles.eventCard, { backgroundColor: tone.bg }]}
                onPress={() => openClub(event.clubId, event.clubName)}
              >
                <View style={styles.dateBox}>
                  <Text style={[styles.dateDay, { color: tone.fg }]}>{d.getDate()}</Text>
                  <Text style={[styles.dateMonth, { color: tone.fg }]}>{MONTHS[d.getMonth()]}</Text>
                </View>
                <View>
                  <Text style={styles.eventTitle} numberOfLines={2}>
                    {event.title}
                  </Text>
                  <Text style={[styles.eventClub, { color: tone.fg }]} numberOfLines={1}>
                    {event.clubName}
                  </Text>
                  <Text style={styles.eventWhen}>{eventWhen(event.dateTime)}</Text>
                </View>
              </TapCard>
            );
          })}
        </ScrollView>
      )}

      <View style={[styles.sectionRow, { marginTop: 22 }]}>
        <Text style={styles.sectionTitle}>All clubs</Text>
        <Text style={styles.count}>{clubs.length}</Text>
      </View>
      <View style={styles.search}>
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search clubs"
          placeholderTextColor={colors.textSecondary}
          returnKeyType="search"
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      {categories.length > 2 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsWrap}
          contentContainerStyle={styles.chips}
        >
          {categories.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, c === category && styles.chipActive]}
              onPress={() => setCategory(c)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, c === category && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      {loadingClubs && <LoadingSpinner style={{ marginTop: spacing.lg }} />}
      {!loadingClubs && shown.length === 0 && (
        <Text style={[styles.emptyText, { marginTop: spacing.md }]}>
          {clubs.length === 0 ? 'No clubs yet.' : 'No club matches that.'}
        </Text>
      )}
    </>
  );

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>
              {events.length > 0 ? `${events.length} upcoming ${events.length === 1 ? 'event' : 'events'}` : 'Campus life'}
            </Text>
            <Text style={styles.h1}>Clubs & Events</Text>
          </View>
          {profile?.role === 'faculty' && (
            <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('CreateClub')}>
              <Ionicons name="add" size={18} color={colors.onPrimary} />
              <Text style={styles.addText}>Club</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={loadingClubs ? [] : shown.length % 2 ? [...shown, { id: '__pad' } as Club] : shown}
          keyExtractor={(club) => club.id}
          numColumns={2}
          contentContainerStyle={styles.scroll}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={Header}
          renderItem={({ item: club }) => {

            if (club.id === '__pad') return <View style={{ flex: 1 }} />;
            const { icon, color } = getClubIcon(club.name);
            return (
              <TapCard style={styles.clubCard} onPress={() => openClub(club.id, club.name)}>
                <View style={[styles.clubIcon, { backgroundColor: color + '1F' }]}>
                  <Ionicons name={icon} size={22} color={color} />
                </View>
                <Text style={styles.clubName} numberOfLines={2}>
                  {club.name}
                </Text>
                {!!club.category && (
                  <Text style={styles.clubCat} numberOfLines={1}>
                    {club.category}
                  </Text>
                )}
              </TapCard>
            );
          }}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, paddingHorizontal: 18 },
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: spacing.md, marginBottom: 14, gap: 12 },
  kicker: { fontSize: 13, fontWeight: '700', color: colors.primary },
  h1: { ...typography.h1, color: colors.textPrimary, marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 4,
  },
  addText: { color: colors.onPrimary, fontWeight: '800', fontSize: 13 },
  scroll: { paddingBottom: 110 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, color: colors.textPrimary },
  link: { fontSize: 13, fontWeight: '800', color: colors.primary },
  count: { fontSize: 13, fontWeight: '800', color: colors.textSecondary },

  eventsWrap: { marginHorizontal: -18, flexGrow: 0 },
  events: { gap: 10, paddingHorizontal: 18 },
  eventCard: { width: 210, minHeight: 150, borderRadius: 22, padding: 14, justifyContent: 'space-between', gap: 10 },
  dateBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { fontSize: 17, fontWeight: '800', lineHeight: 19 },
  dateMonth: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  eventTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.2, lineHeight: 19 },
  eventClub: { fontSize: 12, fontWeight: '800', marginTop: 3 },
  eventWhen: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 1 },
  emptyEvents: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
  },
  emptyText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary, paddingVertical: 0 },
  chipsWrap: { marginHorizontal: -18, marginTop: 10, flexGrow: 0, flexShrink: 0, height: 40 },
  chips: { gap: 8, paddingHorizontal: 18, alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.ink },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  chipTextActive: { color: colors.onInk },

  gridRow: { gap: 10, marginTop: 10 },
  clubCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, padding: 14, gap: 4, minHeight: 128 },
  clubIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  clubName: { fontSize: 14, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.2, lineHeight: 18 },
  clubCat: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
});
