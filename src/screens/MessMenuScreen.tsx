import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  colors,
  spacing,
  radius,
  typography,
  clayShadowSoft,
} from "../theme/theme";
import { messMenu, getTodayIndex, MealType } from "../data/messMenu";

const mealIcons: Record<MealType, keyof typeof Ionicons.glyphMap> = {
  
  Lunch: "restaurant-outline",
  
};

export default function MessMenuScreen() {
  // On a weekend, getTodayIndex() returns -1 (no entry exists for
  // Sat/Sun) — default the initial tab to Monday (index 0) instead of
  // an invalid index, but keep todayIndex itself at -1 so the "today"
  // dot correctly shows on no tab at all over the weekend, rather than
  // falsely marking Monday as "today" three days early.
  const todayIndex = getTodayIndex();
  const [selectedIndex, setSelectedIndex] = useState(todayIndex === -1 ? 0 : todayIndex);
  const dayMenu = messMenu[selectedIndex];

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.title}>Mess Menu</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dayTabs}
          contentContainerStyle={{ gap: spacing.sm }}
        >
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
        </ScrollView>

        {!dayMenu ? (
          // Shouldn't be reachable now that selectedIndex is always
          // clamped to a real weekday above, but a friendly message
          // here costs nothing and means a future change to messMenu
          // (removing a day, say) fails safe instead of crashing the
          // whole screen the way this exact spot already has once.
          <View style={styles.mealsList}>
            <Text style={styles.title}>No menu set for this day yet.</Text>
          </View>
        ) : (
        <ScrollView contentContainerStyle={styles.mealsList}>
          {(Object.keys(dayMenu.meals) as MealType[]).map((meal) => (
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
        </ScrollView>
        )}
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
  dayTabs: { marginBottom: spacing.md, flexGrow: 0 },
  dayTab: {
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
});
