import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "../theme/theme";
import type { RootStackParamList } from "./types";

import TabNavigator from "./TabNavigator";
import CGPACalculatorScreen from "../screens/CGPACalculatorScreen";
import AcademicCalendarScreen from "../screens/AcademicCalendarScreen";
import MessMenuScreen from "../screens/MessMenuScreen";
import MessOrderScreen from "../screens/MessOrderScreen";
import MessTokenScreen from "../screens/MessTokenScreen";
import MessWalletScreen from "../screens/MessWalletScreen";
import MessOrderHistoryScreen from "../screens/MessOrderHistoryScreen";
import MessStaffScreen from "../screens/MessStaffScreen";
import ThaliPassScreen from "../screens/ThaliPassScreen";
import ScanThaliPassScreen from "../screens/ScanThaliPassScreen";
import ResourcesScreen from "../screens/ResourcesScreen";
import LostFoundScreen from "../screens/LostFoundScreen";
import PostLostFoundScreen from "../screens/PostLostFoundScreen";
import FacultyDirectoryScreen from "../screens/FacultyDirectoryScreen";
import ApplyLeaveScreen from "../screens/ApplyLeaveScreen";
import LeaveRequestsScreen from "../screens/LeaveRequestsScreen";
import AnnouncementsScreen from "../screens/AnnouncementsScreen";
import TranscriptScreen from "../screens/TranscriptScreen";
import GradeEntryScreen from "../screens/GradeEntryScreen";
import ScanPosterScreen from "../screens/ScanPosterScreen";
import RechargeCheckoutScreen from "../screens/RechargeCheckoutScreen";
import MarkAttendanceScreen from "../screens/MarkAttendanceScreen";
import MyAttendanceScreen from "../screens/MyAttendanceScreen";
import SubmitEventExcusalScreen from "../screens/SubmitEventExcusalScreen";
import EventExcusalRequestsScreen from "../screens/EventExcusalRequestsScreen";
import PlaceholderScreen from "../screens/PlaceholderScreen";
import ClubDetailScreen from "../screens/ClubDetailScreen";
import CreateClubScreen from "../screens/CreateClubScreen";
import PostEventScreen from "../screens/PostEventScreen";
import PostNoticeScreen from "../screens/PostNoticeScreen";
import PlacementsScreen from "../screens/PlacementsScreen";
import UploadResourceScreen from "../screens/faculty/UploadResourceScreen";
import EditProfileScreen from "../screens/EditProfileScreen";
import HelpSupportScreen from "../screens/HelpSupportScreen";
import AboutScreen from "../screens/AboutScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.textPrimary },
        headerShadowVisible: false,
        // Previously unset — meant iOS and Android used their own,
        // slightly different default push transitions, one small but
        // real contributor to the app feeling inconsistent screen to
        // screen. Setting this once here applies everywhere without
        // touching any individual screen file.
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen
        name="Tabs"
        component={TabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CGPACalculator"
        component={CGPACalculatorScreen}
        options={{ title: "CGPA Calculator" }}
      />
      <Stack.Screen
        name="AcademicCalendar"
        component={AcademicCalendarScreen}
        options={{ title: "Academic Calendar" }}
      />
      <Stack.Screen
        name="MessMenu"
        component={MessMenuScreen}
        options={{ title: "Mess Menu" }}
      />
      <Stack.Screen
        name="MessOrder"
        component={MessOrderScreen}
        options={{ title: "Order Food" }}
      />
      <Stack.Screen
        name="MessToken"
        component={MessTokenScreen}
        options={{ title: "Your Token", headerShown: false }}
      />
      <Stack.Screen
        name="MessWallet"
        component={MessWalletScreen}
        options={{ title: "Mess Wallet" }}
      />
      <Stack.Screen
        name="MessOrderHistory"
        component={MessOrderHistoryScreen}
        options={{ title: "Order History" }}
      />
      <Stack.Screen
        name="MessStaff"
        component={MessStaffScreen}
        options={{ title: "Mess Counter" }}
      />
      <Stack.Screen
        name="ThaliPass"
        component={ThaliPassScreen}
        options={{ title: "Thali Pass" }}
      />
      <Stack.Screen
        name="ScanThaliPass"
        component={ScanThaliPassScreen}
        options={{ title: "Scan Thali Pass" }}
      />
      <Stack.Screen
        name="LostFound"
        component={LostFoundScreen}
        options={{ title: "Lost & Found" }}
      />
      <Stack.Screen
        name="PostLostFound"
        component={PostLostFoundScreen}
        options={{ title: "Post an Item" }}
      />
      <Stack.Screen
        name="Resources"
        component={ResourcesScreen}
        options={{ title: "Resources" }}
      />
      <Stack.Screen
        name="UploadResource"
        component={UploadResourceScreen}
        options={{ title: "Upload Resource" }}
      />
      <Stack.Screen
        name="Faculty"
        component={FacultyDirectoryScreen}
        options={{ title: "Faculty Directory" }}
      />
      <Stack.Screen
        name="ApplyLeave"
        component={ApplyLeaveScreen}
        options={{ title: "Apply for Leave" }}
      />
      <Stack.Screen
        name="LeaveRequests"
        component={LeaveRequestsScreen}
        options={{ title: "Leave Requests" }}
      />
      <Stack.Screen
        name="Announcements"
        component={AnnouncementsScreen}
        options={{ title: "Announcements" }}
      />
      <Stack.Screen
        name="Transcript"
        component={TranscriptScreen}
        options={{ title: "Official Transcript" }}
      />
      <Stack.Screen
        name="GradeEntry"
        component={GradeEntryScreen}
        options={{ title: "Enter Grades" }}
      />
      <Stack.Screen
        name="ScanPoster"
        component={ScanPosterScreen}
        options={{ title: "Scan Event Poster" }}
      />
      <Stack.Screen
        name="RechargeCheckout"
        component={RechargeCheckoutScreen}
        options={{ title: "Recharge Wallet" }}
      />
      <Stack.Screen
        name="MarkAttendance"
        component={MarkAttendanceScreen}
        options={{ title: "Mark Attendance" }}
      />
      <Stack.Screen
        name="MyAttendance"
        component={MyAttendanceScreen}
        options={{ title: "My Attendance" }}
      />
      <Stack.Screen
        name="SubmitEventExcusal"
        component={SubmitEventExcusalScreen}
        options={{ title: "Event Excusal" }}
      />
      <Stack.Screen
        name="EventExcusalRequests"
        component={EventExcusalRequestsScreen}
        options={{ title: "Excusal Requests" }}
      />
      <Stack.Screen
        name="Placement"
        component={PlacementsScreen}
        options={{ title: "Placements" }}
      />
      <Stack.Screen
        name="ClubDetail"
        component={ClubDetailScreen}
        options={{ title: "" }}
      />
      <Stack.Screen
        name="CreateClub"
        component={CreateClubScreen}
        options={{ title: "New Club" }}
      />
      <Stack.Screen
        name="PostEvent"
        component={PostEventScreen}
        options={{ title: "Post Event" }}
      />
      <Stack.Screen
        name="PostNotice"
        component={PostNoticeScreen}
        options={{ title: "Post Notice" }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: "Edit Profile" }}
      />
      <Stack.Screen
        name="NotificationSettings"
        options={{ title: "Notification Settings" }}
      >
        {() => (
          <PlaceholderScreen
            title="Notification Settings"
            icon="notifications-outline"
            description="Choose which notices and events you get notified about."
          />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="HelpSupport"
        component={HelpSupportScreen}
        options={{ title: "Help & Support" }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ title: "About" }}
      />
    </Stack.Navigator>
  );
}
