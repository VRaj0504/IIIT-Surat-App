import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { localIso, subscribeMyMeetings, type Meeting } from "../firebase/meetingsService";
import MeetingCard from "../components/MeetingCard";
import LoadingSpinner from "../components/LoadingSpinner";
import { EmptyState } from "../components/ui";

export default function MeetingsScreen() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<Meeting[] | null>(null);
  useEffect(() => {
    if (!user) return;
    return subscribeMyMeetings(user.uid, setItems, 14);
  }, [user]);

  if (!user || items === null) return <LoadingSpinner />;
  const today = localIso();
  const upcoming = items.filter((m) => m.date >= today);
  const past = items.filter((m) => m.date < today).reverse();
  const card = (m: Meeting) => (
    <MeetingCard key={m.id} m={m} uid={user.uid} name={profile?.name ?? ""} role={profile?.role ?? "student"} />
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      {items.length === 0 ? (
        <EmptyState icon="people-outline" title="No meetings" hint="When the Director's office calls you to a meeting, it shows up here." />
      ) : (
        <>
          <Text style={styles.section}>Coming up</Text>
          {upcoming.length ? upcoming.map(card) : <Text style={styles.none}>Nothing coming up.</Text>}
          {past.length > 0 && (
            <View style={{ opacity: 0.7 }}>
              <Text style={styles.section}>Past two weeks</Text>
              {past.map(card)}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  section: { fontSize: 13, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: spacing.sm, marginTop: spacing.sm },
  none: { color: colors.textSecondary, fontSize: 14, marginBottom: spacing.md },
});
