import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { subscribeMyMeetings, type Meeting } from "../firebase/meetingsService";
import MeetingCard from "./MeetingCard";

export default function HomeMeetings({ onOpenAll, style }: { onOpenAll: () => void; style?: object }) {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<Meeting[]>([]);
  useEffect(() => {
    if (!user) return;
    return subscribeMyMeetings(user.uid, setItems);
  }, [user]);
  if (!user || items.length === 0) return null;
  const shown = items.slice(0, 2);
  return (
    <View style={style}>
      {shown.map((m) => (
        <MeetingCard key={m.id} m={m} uid={user.uid} name={profile?.name ?? ""} role={profile?.role ?? "student"} compact onPress={onOpenAll} />
      ))}
      {items.length > 2 && (
        <TouchableOpacity onPress={onOpenAll} style={styles.more}>
          <Text style={styles.moreText}>See all {items.length} meetings</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  more: { alignSelf: "flex-start", paddingVertical: 6, marginBottom: 8 },
  moreText: { color: colors.primary, fontWeight: "800", fontSize: 13.5 },
});
