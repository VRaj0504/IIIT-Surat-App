import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/theme';
import type { RootTabParamList } from './types';

import HomeScreen from '../screens/HomeScreen';
import TimetableScreen from '../screens/TimetableScreen';
import AttendanceRouter from '../screens/AttendanceRouter';
import NoticesScreen from '../screens/NoticesScreen';
import ClubsScreen from '../screens/ClubsScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();

const iconMap: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'home',
  Timetable: 'calendar',
  Attendance: 'checkmark-circle',
  Notices: 'megaphone',
  Clubs: 'people',
  Profile: 'person',
};

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={focused ? iconMap[route.name as keyof RootTabParamList] : (`${iconMap[route.name as keyof RootTabParamList]}-outline` as keyof typeof Ionicons.glyphMap)}
            size={size}
            color={color}
          />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Timetable" component={TimetableScreen} />
      <Tab.Screen name="Attendance" component={AttendanceRouter} />
      <Tab.Screen name="Notices" component={NoticesScreen} />
      <Tab.Screen name="Clubs" component={ClubsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
