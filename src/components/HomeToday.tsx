import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius, spacing } from "../theme/theme";
import TapCard from "./TapCard";
import { useAuth } from "../context/AuthContext";
import { useMessMenu } from "../firebase/messMenuService";
import { getTodayIndex } from "../data/messMenu";
import { ClubEvent, isFollowingClub, subscribeToAllUpcomingEvents } from "../firebase/clubsService";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function whenLabel(date: Date): string {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
  let h = date.getHours();
  const m = date.getMinutes();
  const mer = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const time = `${h}:${String(m).padStart(2, "0")} ${mer}`;
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days < 7) return `${WEEKDAYS[date.getDay()]}, ${time}`;
  return `${date.getDate()}/${date.getMonth() + 1}, ${time}`;
}

/**
 * Two small cards for a student's Home: today's lunch, and the next event from a club they follow.
 * Each card hides itself when it has nothing to show.
 */
export default function HomeToday({
  onOpenMess,
  onOpenClub,
}: {
  onOpenMess: () => void;
  onOpenClub: (clubId: string, clubName: string) => void;
}) {
  const { profile } = useAuth();
  const menu = useMessMenu();
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const followed = profile?.followedClubs;
  const followsAny = !!followed?.length;

  useEffect(() => {
    if (!followsAny) return;
    return subscribeToAllUpcomingEvents(setEvents);
  }, [followsAny]);

  const lunch = useMemo(() => {
    const i = getTodayIndex();
    return i >= 0 ? menu[i]?.meals.Lunch ?? [] : [];
  }, [menu]);

  const next = useMemo(() => {
    if (!followsAny) return null;
    const now = Date.now();
    return events.find((e) => isFollowingClub(followed, e.clubId) && (e.dateTime?.toMillis?.() ?? 0) >= now) ?? null;
  }, [events, followed, followsAny]);

  if (lunch.length === 0 && !next) return null;

  return (
    <View style={styles.wrap}>
      {lunch.length > 0 && (
        <TapCard style={styles.card} onPress={onOpenMess} accessibilityLabel="Today's lunch">
          <View style={[styles.icon, { backgroundColor: colors.tile.peach.bg }]}>
            <Ionicons name="restaurant-outline" size={18} color={colors.tile.peach.fg} />
          </View>
          <View style={styles.body}>
            <Text style={styles.kicker}>Today's lunch</Text>
            <Text style={styles.title} numberOfLines={2}>
              {lunch.slice(0, 3).join(" · ")}
              {lunch.length > 3 ? <Text style={styles.more}>{`  +${lunch.length - 3} more`}</Text> : null}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TapCard>
      )}
      {next && (
        <TapCard style={styles.card} onPress={() => onOpenClub(next.clubId, next.clubName)} accessibilityLabel="Next event from a club you follow">
          <View style={[styles.icon, { backgroundColor: colors.tile.lilac.bg }]}>
            <Ionicons name="sparkles-outline" size={18} color={colors.tile.lilac.fg} />
          </View>
          <View style={styles.body}>
            <Text style={styles.kicker}>
              {next.clubName} · {whenLabel(next.dateTime.toDate())}
            </Text>
            <Text style={styles.title} numberOfLines={1}>
              {next.title}
            </Text>
            {!!next.venue && (
              <Text style={styles.sub} numberOfLines={1}>
                {next.venue}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TapCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.sm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  body: { flex: 1 },
  kicker: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 2 },
  title: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  more: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
});
