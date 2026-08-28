// Central place for navigation param types. Add a new screen here first,
// then it gets full type-checking + autocomplete everywhere else.
import type { ClubEvent } from "../firebase/clubsService";
import type { Notice } from "../firebase/noticesService";
import type { CartLine } from "../firebase/messService";

export type RootTabParamList = {
  Home: undefined;
  Timetable: undefined;
  Notices: undefined;
  Clubs: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  Attendance: undefined;
  MessMenu: undefined;
  // reorderItems, when present, prefills the cart with a past order's
  // items (quantities capped to whatever's actually in stock right now).
  MessOrder: { reorderItems?: CartLine[] } | undefined;
  MessToken: { orderId: string };
  MessWallet: undefined;
  MessOrderHistory: undefined;
  MessStaff: undefined;
  CGPACalculator: undefined;
  LostFound: undefined;
  PostLostFound: { type?: "lost" | "found" } | undefined;
  ApplyLeave: undefined;
  LeaveRequests: undefined;
  Announcements: undefined;
  PostAnnouncement: undefined;
  Resources: undefined;
  UploadResource: undefined;
  Faculty: undefined;
  Placement: undefined;
  AcademicCalendar: undefined;
  ClubDetail: { clubId: string; clubName: string };
  CreateClub: undefined;
  PostEvent: { clubId: string; clubName: string; editingEvent?: ClubEvent };
  PostNotice:
    { clubId?: string; clubName?: string; editingNotice?: Notice } | undefined;
  EditProfile: undefined;
  NotificationSettings: undefined;
  HelpSupport: undefined;
  About: undefined;
};
