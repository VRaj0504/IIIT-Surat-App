import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme/theme';
import { messMenu, getTodayIndex, MealType } from '../data/messMenu';

const mealIcons: Record<MealType, keyof typeof Ionicons.glyphMap> = {
  Breakfast: 'sunny-outline',
  Lunch: 'restaurant-outline',
  Snacks: 'cafe-outline',
  Dinner: 'moon-outline',
};

export default function MessMenuScreen() {
  const [selectedIndex, setSelectedIndex] = useState(getTodayIndex());
  const todayIndex = getTodayIndex();
  const dayMenu = messMenu[selectedIndex];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
            style={[styles.dayTab, selectedIndex === index && styles.dayTabActive]}
          >
            <Text style={[styles.dayTabText, selectedIndex === index && styles.dayTabTextActive]}>
              {d.day.slice(0, 3)}
            </Text>
            {index === todayIndex && <View style={styles.todayDot} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.mealsList}>
        {(Object.keys(dayMenu.meals) as MealType[]).map((meal) => (
          <View key={meal} style={styles.mealCard}>
            <View style={styles.mealHeader}>
              <Ionicons name={mealIcons[meal]} size={20} color={colors.primary} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.sm, marginBottom: spacing.md },
  dayTabs: { marginBottom: spacing.md, flexGrow: 0 },
  dayTab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  dayTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayTabText: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  dayTabTextActive: { color: '#fff' },
  todayDot: {
    position: 'absolute',
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  mealTitle: { ...typography.h3, color: colors.textPrimary },
  itemsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  itemPill: {
    backgroundColor: colors.background,
    borderRadius: radius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemText: { ...typography.caption, color: colors.textPrimary },
});
