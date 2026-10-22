

import type { ClubEvent } from "../firebase/clubsService";
import type { Notice } from "../firebase/noticesService";

export type RootTabParamList = {
  Home: undefined;
  Timetable: undefined;
  Notices: undefined;
  Clubs: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  MessMenu: undefined;

  ThaliPass: undefined;
  ScanThaliPass: undefined;

  LostFound: undefined;
  PostLostFound: { type?: "lost" | "found" } | undefined;
  ApplyLeave: undefined;
  LeaveRequests: undefined;
  SubmitComplaint: undefined;
Complaints: undefined;
  Announcements: undefined;
  Transcript: undefined;
  ExamSchedule: undefined;
  GradeEntry: undefined;
  ScanPoster: undefined;
  MarkAttendance: undefined;
  MyAttendance: undefined;
  SubmitEventExcusal: undefined;
  EventExcusalRequests: undefined;
  Resources: undefined;
  UploadResource: undefined;
  Faculty: undefined;
  Placement: undefined;
  AcademicCalendar: undefined;
  ClubDetail: { clubId: string; clubName: string };
  Events: undefined;
  Counselling: undefined;
  RoomAvailability: undefined;
  CounsellingQueue: undefined;
  CreateClub: undefined;
  PostEvent: { clubId: string; clubName: string; editingEvent?: ClubEvent };
  PostNotice:
    { clubId?: string; clubName?: string; editingNotice?: Notice } | undefined;
  EditProfile: undefined;
  NotificationSettings: undefined;
  HelpSupport: undefined;
  ImportantContacts: undefined;
  MyDownloads: undefined;
  FileViewer: { uri: string; name: string };
  About: undefined;
  SOS: undefined;
  SosAlerts: undefined;
};
