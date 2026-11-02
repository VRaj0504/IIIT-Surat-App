import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  colors,
  spacing,
  radius,
  typography,
  clayShadowSoft,
} from "../theme/theme";
import { messMenu, getTodayIndex, MealType } from "../data/messMenu";
import { subscribeToMessExtras, DEFAULT_MESS_EXTRAS, MessExtra } from "../firebase/messExtrasService";

const mealIcons: Record<MealType, keyof typeof Ionicons.glyphMap> = {

  Lunch: "restaurant-outline",

};

export default function MessMenuScreen() {

  const todayIndex = getTodayIndex();
  const [selectedIndex, setSelectedIndex] = useState(todayIndex === -1 ? 0 : todayIndex);
  const dayMenu = messMenu[selectedIndex];
  const [extras, setExtras] = useState<MessExtra[]>(DEFAULT_MESS_EXTRAS);
  useEffect(() => subscribeToMessExtras(setExtras), []);

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>

        <View style={styles.dayTabs}>
          {messMenu.map((d, index) => (
            <TouchableOpacity
              key={d.day}
              onPress={() => setSelectedIndex(index)}
              style={[
                styles.dayTab,
                selectedIndex === index && styles.dayTabActive,
              ]}
            >
              <Text
                style={[
                  styles.dayTabText,
                  selectedIndex === index && styles.dayTabTextActive,
                ]}
              >
                {d.day.slice(0, 3)}
              </Text>
              {index === todayIndex && <View style={styles.todayDot} />}
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.mealsList}>
          {!dayMenu ? (
            <View style={styles.mealCard}>
              <Text style={styles.itemText}>No menu set for this day yet.</Text>
            </View>
          ) : (Object.keys(dayMenu.meals) as MealType[]).map((meal) => (
            <View key={meal} style={styles.mealCard}>
              <View style={styles.mealHeader}>
                <Ionicons
                  name={mealIcons[meal]}
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.mealTitle}>{meal}</Text>
              </View>
              <View style={styles.itemsWrap}>
                {dayMenu.meals[meal].map((item) => (
                  <View key={item} style={styles.itemPill}>
                    <Text style={styles.itemText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          <View style={styles.mealCard}>
            <View style={styles.mealHeader}>
              <Ionicons name="cafe-outline" size={20} color={colors.primary} />
              <Text style={styles.mealTitle}>Always available</Text>
            </View>
            <Text style={styles.extrasHint}>Any day, any time the mess counter is open.</Text>
            {extras.map((x, i) => (
              <View key={x.id} style={[styles.extraRow, i > 0 && styles.extraRowBorder]}>
                <Text style={styles.extraName}>{x.name}</Text>
                <Text style={[styles.extraPrice, x.price == null && styles.extraPriceUnknown]}>
                  {x.price == null ? "Ask at counter" : `₹${x.price}`}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  dayTabs: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md },
  dayTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    ...clayShadowSoft,
    alignItems: "center",
  },
  dayTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayTabText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  dayTabTextActive: { color: colors.onPrimary },
  todayDot: {
    position: "absolute",
    top: 4,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  mealsList: { paddingBottom: spacing.xl },
  mealCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...clayShadowSoft,
  },
  mealHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  mealTitle: { ...typography.h3, color: colors.textPrimary },
  itemsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  itemPill: {
    backgroundColor: colors.background,
    borderRadius: radius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    ...clayShadowSoft,
  },
  itemText: { ...typography.caption, color: colors.textPrimary },
  extrasHint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  extraRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.sm },
  extraRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  extraName: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  extraPrice: { ...typography.body, color: colors.primary, fontWeight: "800" },
  extraPriceUnknown: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
});
