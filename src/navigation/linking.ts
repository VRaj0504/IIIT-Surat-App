import { Platform } from "react-native";
import type { LinkingOptions } from "@react-navigation/native";
import { PLUS_ENABLED } from "../firebase/plusService";

export const linking: LinkingOptions<any> | undefined =
  Platform.OS === "web"
    ? {
        prefixes: [],
        config: {
          screens: {
            Tabs: {
              screens: {
                Home: "",
                Timetable: "timetable",
                Notices: "notices",
                Clubs: "clubs",
                Profile: "profile",
              },
            },
      AcademicCalendar: 'academic-calendar',
      MessMenu: 'mess-menu',
      ThaliPass: 'thali-pass',
      ScanThaliPass: 'scan-thali-pass',
      Resources: 'resources',
      UploadResource: 'upload-resource',
      Faculty: 'faculty',
      ApplyLeave: 'apply-leave',
      LeaveRequests: 'leave-requests',
      SubmitComplaint: 'submit-complaint',
      Complaints: 'complaints',
      Announcements: 'announcements',
      Meetings: 'meetings',
      Transcript: 'transcript',
      Marks: 'marks',
      ExamSchedule: 'exam-schedule',
      ExamStatus: 'exam-status',
      GradeEntry: 'grade-entry',
      ScanPoster: 'scan-poster',
      MarkAttendance: 'mark-attendance',
      MyAttendance: 'my-attendance',
      SubmitEventExcusal: 'submit-event-excusal',
      EventExcusalRequests: 'event-excusal-requests',
      Placement: 'placement',
      ClubDetail: 'club-detail',
      Events: 'events',
      Counselling: 'counselling',
      RoomAvailability: 'room-availability',
      Curriculum: 'curriculum',
      CounsellingQueue: 'counselling-queue',
      CreateClub: 'create-club',
      PostEvent: 'post-event',
      PostNotice: 'post-notice',
      EditProfile: 'edit-profile',
      NotificationSettings: 'notification-settings',
      Notifications: 'notifications',
      HelpSupport: 'help-support',
      ImportantContacts: 'important-contacts',
      MyDownloads: 'my-downloads',
      FileViewer: 'file-viewer',
      About: 'about',
      SOS: 'sos',
      SosAlerts: 'sos-alerts',
      ...(PLUS_ENABLED ? { Plus: 'plus', LeavePlanner: 'leave-planner', CgpaPlanner: 'cgpa-planner' } : {}),
          },
        },
      }
    : undefined;

export function formatDocumentTitle(options: any, route: any): string {
  const raw = options?.title ?? route?.name ?? "Home";
  const pretty = String(raw).replace(/([a-z])([A-Z])/g, "$1 $2");
  return `${pretty} · CollegeGo`;
}
