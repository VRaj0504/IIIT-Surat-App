import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { subscribeToClubs, subscribeToAllUpcomingEvents, Club, ClubEvent } from '../firebase/clubsService';

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
      setClubs(data);
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

  const openClub = (club: Club) => {
    navigation.navigate('ClubDetail', { clubId: club.id, clubName: club.name });
  };

  const openEventsClub = (event: ClubEvent) => {
    navigation.navigate('ClubDetail', { clubId: event.clubId, clubName: event.clubName });
  };

  return (
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
        data={clubs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.eventsSection}>
            <Text style={styles.sectionTitle}>Upcoming Events</Text>
            {loadingEvents ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
            ) : events.length === 0 ? (
              <Text style={styles.emptyText}>No upcoming events yet.</Text>
            ) : (
              events.map((event) => (
                <TouchableOpacity
                  key={event.id}
                  style={styles.eventCard}
                  onPress={() => openEventsClub(event)}
                  activeOpacity={0.7}
                >
                  <View style={styles.eventIconWrap}>
                    <Ionicons name="calendar" size={20} color={colors.accent} />
                  </View>
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    <Text style={styles.eventClub}>{event.clubName}</Text>
                    <Text style={styles.eventDate}>{formatEventDate(event.dateTime)}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
            <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>All Clubs</Text>
          </View>
        }
        ListEmptyComponent={
          loadingClubs ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
          ) : (
            <Text style={styles.emptyText}>No clubs yet.</Text>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openClub(item)} activeOpacity={0.7}>
            <View style={styles.iconWrap}>
              <Ionicons name="people" size={22} color={colors.primary} />
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.category}>{item.category} · Lead: {item.leadName}</Text>
              <Text style={styles.description}>{item.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { ...typography.h1, color: colors.textPrimary },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingBottom: spacing.xl },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  eventsSection: { marginBottom: spacing.sm },
  emptyText: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: '#FEF3E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  eventInfo: { flex: 1 },
  eventTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  eventClub: { ...typography.caption, color: colors.primary, fontWeight: '600', marginTop: 2 },
  eventDate: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: '#EAF0FB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  info: { flex: 1 },
  name: { ...typography.h3, color: colors.textPrimary },
  category: { ...typography.caption, color: colors.primary, fontWeight: '600', marginTop: 2, marginBottom: spacing.xs },
  description: { ...typography.body, color: colors.textSecondary },
});
