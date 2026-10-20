import { Platform } from "react-native";
import type { LinkingOptions } from "@react-navigation/native";

// Real, readable URLs on the web build (/timetable, /notices,
// /academic-calendar ...) so the browser's back/forward buttons, refresh and
// shared links behave like a website. Disabled on Android/iOS.
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
      LostFound: 'lost-found',
      PostLostFound: 'post-lost-found',
      Resources: 'resources',
      UploadResource: 'upload-resource',
      Faculty: 'faculty',
      ApplyLeave: 'apply-leave',
      LeaveRequests: 'leave-requests',
      SubmitComplaint: 'submit-complaint',
      Complaints: 'complaints',
      Announcements: 'announcements',
      Transcript: 'transcript',
      ExamSchedule: 'exam-schedule',
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
      CounsellingQueue: 'counselling-queue',
      CreateClub: 'create-club',
      PostEvent: 'post-event',
      PostNotice: 'post-notice',
      EditProfile: 'edit-profile',
      NotificationSettings: 'notification-settings',
      HelpSupport: 'help-support',
      ImportantContacts: 'important-contacts',
      MyDownloads: 'my-downloads',
      FileViewer: 'file-viewer',
      About: 'about',
          },
        },
      }
    : undefined;

// Browser tab title: "Academic Calendar · IIIT Surat".
export function formatDocumentTitle(options: any, route: any): string {
  const raw = options?.title ?? route?.name ?? "Home";
  const pretty = String(raw).replace(/([a-z])([A-Z])/g, "$1 $2");
  return `${pretty} · IIIT Surat`;
}
