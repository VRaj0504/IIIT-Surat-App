import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius, spacing } from "../theme/theme";
import { confirmAction, notice, unblockUser, useBlockedList } from "../firebase/moderationService";
import { openSafeUrl } from "../utils/safeLink";
import { COMMUNITY_GUIDELINES_URL } from "../config/college";

/** People this user has blocked from the ⋯ menu on an event or notice. Their posts stay hidden until unblocked. */
export default function BlockedPeopleScreen() {
  const list = useBlockedList();

  const unblock = (uid: string, name: string) =>
    confirmAction(`Unblock ${name}?`, "Their events and notices will show again.", "Unblock", () =>
      unblockUser(uid).catch(() => notice("Couldn't unblock", "Check your internet and try again.")),
    );

  return (
    <SafeAreaView style={styles.page} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          You won't see events or notices posted by people you block. To block someone, tap ⋯ on one of their posts.
        </Text>
        {list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="shield-checkmark-outline" size={30} color={colors.textSecondary} />
            <Text style={styles.emptyText}>You haven't blocked anyone.</Text>
          </View>
        ) : (
          list.map((p) => (
            <View key={p.uid} style={styles.row}>
              <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
              <TouchableOpacity style={styles.btn} onPress={() => unblock(p.uid, p.name)}>
                <Text style={styles.btnText}>Unblock</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        <TouchableOpacity style={styles.link} onPress={() => openSafeUrl(COMMUNITY_GUIDELINES_URL).catch(() => undefined)}>
          <Ionicons name="document-text-outline" size={16} color={colors.primary} />
          <Text style={styles.linkText}>Community guidelines</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, paddingBottom: 120 },
  intro: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: spacing.md },
  empty: { alignItems: "center", paddingVertical: spacing.xl, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 15 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 10,
  },
  name: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  btnText: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  link: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, alignSelf: "center" },
  linkText: { color: colors.primary, fontWeight: "700" },
});
