import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, SectionList, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { subscribeToAllUpcomingEvents, ClubEvent } from "../firebase/clubsService";
import { getClubIcon } from "../data/clubIcons";
import GlassCard from "../components/GlassCard";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

function formatEventTime(timestamp: ClubEvent["dateTime"]): string {
  return timestamp.toDate().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

// "Today" / "Tomorrow" / "This Week" / "Later" — every college event feed
// is really "what's coming up soon" more than "the full list", so grouping
// by how-soon reads faster than one flat chronological list, the same way
// a calendar app buckets things rather than just sorting them.
function bucketFor(date: Date, now: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);
  const eventDay = startOfDay(date);
  const diffDays = Math.round((eventDay.getTime() - today.getTime()) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7) return "This Week";
  return "Later";
}
const BUCKET_ORDER = ["Today", "Tomorrow", "This Week", "Later"];

export default function EventsScreen() {
  const navigation = useNavigation<NavProp>();
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedClub, setSelectedClub] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToAllUpcomingEvents((data) => {
      setEvents(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Only clubs that actually have an upcoming event show up as a filter
  // chip — a chip for a club with nothing to show would just be a dead end.
  const clubNames = useMemo(
    () => Array.from(new Set(events.map((e) => e.clubName))).sort((a, b) => a.localeCompare(b)),
    [events],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((e) => {
      if (selectedClub && e.clubName !== selectedClub) return false;
      if (!term) return true;
      return e.title.toLowerCase().includes(term) || e.description.toLowerCase().includes(term);
    });
  }, [events, search, selectedClub]);

  const sections = useMemo(() => {
    const now = new Date();
    const byBucket = new Map<string, ClubEvent[]>();
    for (const event of filtered) {
      const bucket = bucketFor(event.dateTime.toDate(), now);
      if (!byBucket.has(bucket)) byBucket.set(bucket, []);
      byBucket.get(bucket)!.push(event);
    }
    // subscribeToAllUpcomingEvents already returns soonest-first, so each
    // bucket's events stay in that order without re-sorting here.
    return BUCKET_ORDER.filter((b) => byBucket.has(b)).map((title) => ({ title, data: byBucket.get(title)! }));
  }, [filtered]);

  const openEvent = (event: ClubEvent) => {
    navigation.navigate("ClubDetail", { clubId: event.clubId, clubName: event.clubName });
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search events"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {clubNames.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={styles.chipRow}
          >
            {[null, ...clubNames].map((club) => (
              <TouchableOpacity
                key={club ?? "all"}
                style={[styles.chip, selectedClub === club && styles.chipActive]}
                onPress={() => setSelectedClub(club)}
              >
                <Text style={[styles.chipText, selectedClub === club && styles.chipTextActive]}>
                  {club ?? "All"}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            stickySectionHeadersEnabled={false}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {events.length === 0 ? "No upcoming events yet." : "No events match this search or filter."}
              </Text>
            }
            renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
            renderItem={({ item: event }) => {
              const { icon, color } = getClubIcon(event.clubName);
              return (
                <GlassCard style={styles.eventCard}>
                  <TouchableOpacity style={styles.eventCardInner} onPress={() => openEvent(event)} activeOpacity={0.7}>
                    <View style={[styles.eventIconWrap, { backgroundColor: color + "22" }]}>
                      <Ionicons name={icon} size={20} color={color} />
                    </View>
                    <View style={styles.eventInfo}>
                      <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                      <Text style={[styles.eventClub, { color }]}>{event.clubName}</Text>
                    </View>
                    <Text style={styles.eventTime}>{formatEventTime(event.dateTime)}</Text>
                  </TouchableOpacity>
                </GlassCard>
              );
            }}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, padding: 0 },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  chipTextActive: { color: colors.surface },
  listContent: { paddingBottom: spacing.xl },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.sm },
  emptyText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xl, textAlign: "center" },
  eventCard: { marginBottom: spacing.sm, ...clayShadowSoft },
  eventCardInner: { flexDirection: "row", alignItems: "center", padding: spacing.md },
  eventIconWrap: {
    width: 40, height: 40, borderRadius: radius.full,
    alignItems: "center", justifyContent: "center", marginRight: spacing.md,
  },
  eventInfo: { flex: 1 },
  eventTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  eventClub: { ...typography.caption, fontWeight: "600", marginTop: 2 },
  eventTime: { ...typography.caption, color: colors.textSecondary, marginLeft: spacing.sm },
});
