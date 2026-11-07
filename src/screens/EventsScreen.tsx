import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, SectionList, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { subscribeToAllUpcomingEvents, subscribeToRecentPastEvents, ClubEvent } from "../firebase/clubsService";
import { getClubIcon } from "../data/clubIcons";
import GlassCard from "../components/GlassCard";
import LoadingSpinner from "../components/LoadingSpinner";
import { KeyboardAwareScrollView } from "../components/KeyboardAware";
import { SelectField, SheetPicker, Segmented } from "../components/ui";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

function formatEventTime(timestamp: ClubEvent["dateTime"]): string {
  const d = timestamp.toDate();
  const day = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  return `${day} · ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

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
  const [clubPickerOpen, setClubPickerOpen] = useState(false);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [past, setPast] = useState<ClubEvent[] | null>(null);

  useEffect(() => {
    if (tab !== "past" || past !== null) return;
    return subscribeToRecentPastEvents(setPast, 30);
  }, [tab, past]);

  useEffect(() => {
    const unsubscribe = subscribeToAllUpcomingEvents((data) => {
      setEvents(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const shownEvents = tab === "past" ? past ?? [] : events;
  const clubNames = useMemo(
    () => Array.from(new Set(shownEvents.map((e) => e.clubName))).sort((a, b) => a.localeCompare(b)),
    [shownEvents],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return shownEvents.filter((e) => {
      if (selectedClub && e.clubName !== selectedClub) return false;
      if (!term) return true;
      return e.title.toLowerCase().includes(term) || e.description.toLowerCase().includes(term);
    });
  }, [shownEvents, search, selectedClub]);

  const sections = useMemo(() => {
    if (tab === "past") {
      const byMonth = new Map<string, ClubEvent[]>();
      for (const e of filtered) {
        const k = e.dateTime.toDate().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
        if (!byMonth.has(k)) byMonth.set(k, []);
        byMonth.get(k)!.push(e);
      }
      return [...byMonth.entries()].map(([title, data]) => ({ title, data }));
    }
    const now = new Date();
    const byBucket = new Map<string, ClubEvent[]>();
    for (const event of filtered) {
      const bucket = bucketFor(event.dateTime.toDate(), now);
      if (!byBucket.has(bucket)) byBucket.set(bucket, []);
      byBucket.get(bucket)!.push(event);
    }

    return BUCKET_ORDER.filter((b) => byBucket.has(b)).map((title) => ({ title, data: byBucket.get(title)! }));
  }, [filtered, tab]);

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

        <Segmented
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past 30 days" },
          ]}
          value={tab}
          onChange={setTab}
          style={{ marginTop: spacing.sm }}
        />
        {clubNames.length > 0 && (
          <SelectField
            value={selectedClub ?? "All clubs"}
            placeholder="All clubs"
            icon="people-outline"
            onPress={() => setClubPickerOpen(true)}
          />
        )}
        <SheetPicker
          visible={clubPickerOpen}
          title="Show events from"
          items={["__all", ...clubNames]}
          keyOf={(c) => c}
          labelOf={(c) => (c === "__all" ? "All clubs" : c)}
          selectedKey={selectedClub ?? "__all"}
          onPick={(c) => setSelectedClub(c === "__all" ? null : c)}
          onClose={() => setClubPickerOpen(false)}
          searchable={clubNames.length > 8}
        />

        {loading || (tab === "past" && past === null) ? (
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            stickySectionHeadersEnabled={false}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {shownEvents.length === 0
                  ? tab === "past"
                    ? "No events in the last 30 days."
                    : "No upcoming events yet."
                  : "No events match this search or filter."}
              </Text>
            }
            renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
            renderItem={({ item: event }) => {
              const { icon, color } = getClubIcon(event.clubName);
              return (
                <GlassCard style={[styles.eventCard, tab === "past" && { opacity: 0.75 }]}>
                  <TouchableOpacity style={styles.eventCardInner} onPress={() => openEvent(event)} activeOpacity={0.7}>
                    <View style={[styles.eventIconWrap, { backgroundColor: color + "22" }]}>
                      <Ionicons name={icon} size={20} color={color} />
                    </View>
                    <View style={styles.eventInfo}>
                      <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
                      <Text style={[styles.eventClub, { color }]} numberOfLines={1}>{event.clubName}</Text>
                      <Text style={styles.eventWhen}>
                        {formatEventTime(event.dateTime)}
                        {event.venue ? ` · ${event.venue}` : ""}
                      </Text>
                      {!!event.category && <Text style={styles.eventCat}>{event.category}</Text>}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
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
  eventWhen: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginTop: 2 },
  eventCat: { alignSelf: "flex-start", marginTop: 4, fontSize: 11, fontWeight: "700", color: colors.textSecondary, backgroundColor: colors.surfaceAlt, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  eventTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  eventClub: { ...typography.caption, fontWeight: "600", marginTop: 2 },
  eventTime: { ...typography.caption, color: colors.textSecondary, marginLeft: spacing.sm },
});
