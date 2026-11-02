import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../theme/theme";
import { usePlus } from "../hooks/usePlus";
import { PrimaryButton } from "./ui";
import LoadingSpinner from "./LoadingSpinner";

export default function PlusGate({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  const { plus, loading } = usePlus();
  const navigation = useNavigation<any>();

  if (loading) return <LoadingSpinner style={{ flex: 1, backgroundColor: colors.background }} />;
  if (plus) return <>{children}</>;

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <View style={styles.badge}>
          <Ionicons name="sparkles" size={24} color={colors.onPrimary} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{sub}</Text>
        <Text style={styles.note}>This is a CollegeGo Plus feature.</Text>
        {Platform.OS === "web" ? (
          <PrimaryButton label="See CollegeGo Plus" icon="sparkles-outline" onPress={() => navigation.navigate("Plus")} style={{ marginTop: 16, alignSelf: "stretch" }} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background, padding: 18, justifyContent: "center" },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 24, alignItems: "center", maxWidth: 520, width: "100%", alignSelf: "center" },
  badge: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, textAlign: "center" },
  sub: { fontSize: 14, fontWeight: "500", color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginTop: 6 },
  note: { fontSize: 13, fontWeight: "700", color: colors.primary, marginTop: 14 },
});
