import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/theme';
import type { RootTabParamList } from './types';
import { useWebLayout } from '../utils/useWebLayout';

import HomeScreen from '../screens/HomeScreen';
import TimetableScreen from '../screens/TimetableScreen';
import NoticesScreen from '../screens/NoticesScreen';
import ClubsScreen from '../screens/ClubsScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();

const iconMap: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'home',
  Timetable: 'calendar',
  Notices: 'megaphone',
  Clubs: 'people',
  Profile: 'person',
};

// C-style bar: a dark rounded pill; the active tab is a white circle.
// It floats over the page with NO background strip behind it, so the
// rounded pill stays soft. Every tab screen keeps TAB_BAR_SPACE of padding
// at the bottom of its scroll content so the last item can be scrolled
// clear of the pill. Plain views — switching tabs is instant.
export const TAB_BAR_SPACE = 110;

function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const name = route.name as keyof RootTabParamList;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={route.name}
              hitSlop={4}
              style={[styles.item, focused && styles.itemActive]}
            >
              <Ionicons
                name={focused ? iconMap[name] : (`${iconMap[name]}-outline` as keyof typeof Ionicons.glyphMap)}
                size={22}
                color={focused ? colors.ink : colors.inkMuted}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabNavigator() {
  // On a wide browser the website header carries the navigation instead.
  const { isDesktop } = useWebLayout();
  return (
    <Tab.Navigator
      tabBar={(props) => (isDesktop ? null : <AppTabBar {...props} />)}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Timetable" component={TimetableScreen} />
      <Tab.Screen name="Notices" component={NoticesScreen} />
      <Tab.Screen name="Clubs" component={ClubsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'transparent', paddingTop: 8, paddingHorizontal: 20 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.ink,
    borderRadius: 32,
    height: 64,
    paddingHorizontal: 8,
    shadowColor: '#0B1220',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  item: { width: 52, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  itemActive: { backgroundColor: colors.onInk },
});
