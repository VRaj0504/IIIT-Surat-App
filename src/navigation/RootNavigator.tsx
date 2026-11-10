import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "../theme/theme";
import type { RootStackParamList } from "./types";
import { useWebLayout } from "../utils/useWebLayout";
import DesktopPageHeader, { DESKTOP_CONTENT_MAX } from "../components/web/DesktopPageHeader";

import TabNavigator from "./TabNavigator";

import AcademicCalendarScreen from "../screens/AcademicCalendarScreen";
import MessMenuScreen from "../screens/MessMenuScreen";
import ThaliPassScreen from "../screens/ThaliPassScreen";
import IdCardScreen from "../screens/IdCardScreen";
import ScanThaliPassScreen from "../screens/ScanThaliPassScreen";
import ResourcesScreen from "../screens/ResourcesScreen";
import FacultyDirectoryScreen from "../screens/FacultyDirectoryScreen";
import ApplyLeaveScreen from "../screens/ApplyLeaveScreen";
import LeaveRequestsScreen from "../screens/LeaveRequestsScreen";
import AnnouncementsScreen from "../screens/AnnouncementsScreen";
import MeetingsScreen from "../screens/MeetingsScreen";
import TranscriptScreen from "../screens/TranscriptScreen";
import MarksScreen from "../screens/MarksScreen";
import ExamScheduleScreen from "../screens/ExamScheduleScreen";
import ExamStatusScreen from "../screens/ExamStatusScreen";
import ScanPosterScreen from "../screens/ScanPosterScreen";
import MarkAttendanceScreen from "../screens/MarkAttendanceScreen";
import MyAttendanceScreen from "../screens/MyAttendanceScreen";
import SubmitEventExcusalScreen from "../screens/SubmitEventExcusalScreen";
import EventExcusalRequestsScreen from "../screens/EventExcusalRequestsScreen";
import ClubDetailScreen from "../screens/ClubDetailScreen";
import EventsScreen from "../screens/EventsScreen";
import CounsellingScreen from "../screens/CounsellingScreen";
import RoomAvailabilityScreen from "../screens/RoomAvailabilityScreen";
import CurriculumScreen from "../screens/CurriculumScreen";
import CounsellingQueueScreen from "../screens/CounsellingQueueScreen";
import CreateClubScreen from "../screens/CreateClubScreen";
import PostEventScreen from "../screens/PostEventScreen";
import PostNoticeScreen from "../screens/PostNoticeScreen";
import PlacementsScreen from "../screens/PlacementsScreen";
import EditProfileScreen from "../screens/EditProfileScreen";
import NotificationSettingsScreen from "../screens/NotificationSettingsScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import HelpSupportScreen from "../screens/HelpSupportScreen";
import ImportantContactsScreen from "../screens/ImportantContactsScreen";
import MyDownloadsScreen from "../screens/MyDownloadsScreen";
import FileViewerScreen from "../screens/FileViewerScreen";
import AboutScreen from "../screens/AboutScreen";
import PlusScreen from "../screens/PlusScreen";
import { PLUS_ENABLED } from "../firebase/plusService";
import LeavePlannerScreen from "../screens/LeavePlannerScreen";
import CgpaPlannerScreen from "../screens/CgpaPlannerScreen";
import SOSScreen from "../screens/SOSScreen";
import SosAlertsScreen from "../screens/SosAlertsScreen";

import SubmitComplaintScreen from "../screens/SubmitComplaintScreen";
import ComplaintsScreen from "../screens/ComplaintsScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isDesktop } = useWebLayout();
  return (
    <Stack.Navigator
      screenOptions={
        isDesktop
          ? {
              header: (props) => <DesktopPageHeader {...props} />,
              contentStyle: { backgroundColor: colors.background, width: "100%", maxWidth: DESKTOP_CONTENT_MAX + 64, alignSelf: "center", paddingHorizontal: 16 },
              animation: "none",
            }
          : {
              headerTintColor: colors.primary,
              headerTitleStyle: { color: colors.textPrimary, fontWeight: "800", fontSize: 18 },
              headerStyle: { backgroundColor: colors.background },
              headerShadowVisible: false,
              headerBackButtonDisplayMode: "minimal",
              contentStyle: { backgroundColor: colors.background },

              animation: "slide_from_right",
            }
      }
    >
      <Stack.Screen
        name="Tabs"
        component={TabNavigator}
        options={{ headerShown: false }}
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
        name="ThaliPass"
        component={ThaliPassScreen}
        options={{ title: "Thali Pass" }}
      />
      <Stack.Screen
        name="IdCard"
        component={IdCardScreen}
        options={{ title: "Digital ID" }}
      />
      <Stack.Screen
        name="ScanThaliPass"
        component={ScanThaliPassScreen}
        options={{ title: "Scan Thali Pass" }}
      />
      <Stack.Screen
        name="Resources"
        component={ResourcesScreen}
        options={{ title: "Resources" }}
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
  name="SubmitComplaint"
  component={SubmitComplaintScreen}
  options={{ title: "Complaints & Doubts" }}
/>
<Stack.Screen
  name="Complaints"
  component={ComplaintsScreen}
  options={{ title: "Complaints & Doubts" }}
/>

      <Stack.Screen
        name="Announcements"
        component={AnnouncementsScreen}
        options={{ title: "Announcements" }}
      />
      <Stack.Screen
        name="Meetings"
        component={MeetingsScreen}
        options={{ title: "Meetings" }}
      />
      <Stack.Screen
        name="Marks"
        component={MarksScreen}
        options={{ title: "My Marks" }}
      />
      <Stack.Screen
        name="Transcript"
        component={TranscriptScreen}
        options={{ title: "Official Transcript" }}
      />

      <Stack.Screen
  name="ExamSchedule"
  component={ExamScheduleScreen}
  options={{ title: "Exam Schedule" }}
/>
      <Stack.Screen
        name="ExamStatus"
        component={ExamStatusScreen}
        options={{ title: "Exam Status" }}
      />
      <Stack.Screen
        name="ScanPoster"
        component={ScanPosterScreen}
        options={{ title: "Scan Event Poster" }}
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
        name="Events"
        component={EventsScreen}
        options={{ title: "Events" }}
      />
      <Stack.Screen
        name="Counselling"
        component={CounsellingScreen}
        options={{ title: "Counselling & Wellness" }}
      />
      <Stack.Screen
        name="Curriculum"
        component={CurriculumScreen}
        options={{ title: "Curriculum" }}
      />
      <Stack.Screen
        name="RoomAvailability"
        component={RoomAvailabilityScreen}
        options={{ title: "Empty Classrooms" }}
      />
      <Stack.Screen
        name="CounsellingQueue"
        component={CounsellingQueueScreen}
        options={{ title: "Counselling Requests" }}
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
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: "Notifications" }}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{ title: "Notification Settings" }}
      />
      <Stack.Screen
        name="HelpSupport"
        component={HelpSupportScreen}
        options={{ title: "Help & Support" }}
      />
      <Stack.Screen
        name="ImportantContacts"
        component={ImportantContactsScreen}
        options={{ title: "Important Contacts" }}
      />
      <Stack.Screen
        name="MyDownloads"
        component={MyDownloadsScreen}
        options={{ title: "My Downloads" }}
      />
      <Stack.Screen
        name="FileViewer"
        component={FileViewerScreen}
        options={{ title: "" }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ title: "About" }}
      />
      {PLUS_ENABLED && (
        <>
          <Stack.Screen name="Plus" component={PlusScreen} options={{ title: "CollegeGo Plus" }} />
          <Stack.Screen name="LeavePlanner" component={LeavePlannerScreen} options={{ title: "Leave planner" }} />
          <Stack.Screen name="CgpaPlanner" component={CgpaPlannerScreen} options={{ title: "CGPA planner" }} />
        </>
      )}
      <Stack.Screen
        name="SOS"
        component={SOSScreen}
        options={{ title: "Emergency SOS", headerTintColor: "#DC2626" }}
      />
      <Stack.Screen
        name="SosAlerts"
        component={SosAlertsScreen}
        options={{ title: "SOS alerts", headerTintColor: "#DC2626" }}
      />
    </Stack.Navigator>
  );
}
