

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

  ApplyLeave: undefined;
  LeaveRequests: undefined;
  SubmitComplaint: undefined;
Complaints: undefined;
  Announcements: undefined;
  Meetings: undefined;
  Transcript: undefined;
  Marks: undefined;
  ExamSchedule: undefined;
  ExamStatus: undefined;
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
  Curriculum: undefined;
  CounsellingQueue: undefined;
  CreateClub: undefined;
  PostEvent: { clubId: string; clubName: string; editingEvent?: ClubEvent };
  PostNotice:
    { clubId?: string; clubName?: string; editingNotice?: Notice } | undefined;
  EditProfile: undefined;
  NotificationSettings: undefined;
  Notifications: undefined;
  HelpSupport: undefined;
  ImportantContacts: undefined;
  MyDownloads: undefined;
  FileViewer: { uri: string; name: string };
  About: undefined;
  Plus: undefined;
  LeavePlanner: undefined;
  CgpaPlanner: undefined;
  SOS: undefined;
  SosAlerts: undefined;
};
