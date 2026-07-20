import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/theme';
import type { RootStackParamList } from './types';

import TabNavigator from './TabNavigator';
import CGPACalculatorScreen from '../screens/CGPACalculatorScreen';
import AcademicCalendarScreen from '../screens/AcademicCalendarScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import MessMenuScreen from '../screens/MessMenuScreen';
import ResourcesScreen from '../screens/ResourcesScreen';
import PlaceholderScreen from '../screens/PlaceholderScreen';
import ClubDetailScreen from '../screens/ClubDetailScreen';
import CreateClubScreen from '../screens/CreateClubScreen';
import PostEventScreen from '../screens/PostEventScreen';
import PostNoticeScreen from '../screens/PostNoticeScreen';
import PlacementsScreen from '../screens/PlacementsScreen';
import UploadResourceScreen from '../screens/faculty/UploadResourceScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import HelpSupportScreen from '../screens/HelpSupportScreen';
import AboutScreen from '../screens/AboutScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.textPrimary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="CGPACalculator" component={CGPACalculatorScreen} options={{ title: 'CGPA Calculator' }} />
      <Stack.Screen name="AcademicCalendar" component={AcademicCalendarScreen} options={{ title: 'Academic Calendar' }} />
      <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
      <Stack.Screen name="MessMenu" component={MessMenuScreen} options={{ title: 'Mess Menu' }} />
      <Stack.Screen name="LostFound" options={{ title: 'Lost & Found' }}>
        {() => <PlaceholderScreen title="Lost & Found" icon="search-outline" description="Post and browse lost or found items around campus." />}
      </Stack.Screen>
      <Stack.Screen name="Resources" component={ResourcesScreen} options={{ title: 'Resources' }} />
<Stack.Screen name="UploadResource" component={UploadResourceScreen} options={{ title: 'Upload Resource' }} />
      <Stack.Screen name="Faculty" options={{ title: 'Faculty Directory' }}>
        {() => <PlaceholderScreen title="Faculty Directory" icon="people-outline" description="Contact details and office hours for all faculty members." />}
      </Stack.Screen>
      <Stack.Screen name="Placement" component={PlacementsScreen} options={{ title: 'Placements' }} />
      <Stack.Screen name="ClubDetail" component={ClubDetailScreen} options={{ title: '' }} />
      <Stack.Screen name="CreateClub" component={CreateClubScreen} options={{ title: 'New Club' }} />
      <Stack.Screen name="PostEvent" component={PostEventScreen} options={{ title: 'Post Event' }} />
      <Stack.Screen name="PostNotice" component={PostNoticeScreen} options={{ title: 'Post Notice' }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
      <Stack.Screen name="NotificationSettings" options={{ title: 'Notification Settings' }}>
        {() => <PlaceholderScreen title="Notification Settings" icon="notifications-outline" description="Choose which notices and events you get notified about." />}
      </Stack.Screen>
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} options={{ title: 'Help & Support' }} />
      <Stack.Screen name="About" component={AboutScreen} options={{ title: 'About' }} />
    </Stack.Navigator>
  );
}
