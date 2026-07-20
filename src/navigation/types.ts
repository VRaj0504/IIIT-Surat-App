// Central place for navigation param types. Add a new screen here first,
// then it gets full type-checking + autocomplete everywhere else.
import type { ClubEvent } from '../firebase/clubsService';
import type { Notice } from '../firebase/noticesService';

export type RootTabParamList = {
  Home: undefined;
  Timetable: undefined;
  Attendance: undefined;
  Notices: undefined;
  Clubs: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  Attendance: undefined;
  MessMenu: undefined;
  CGPACalculator: undefined;
  LostFound: undefined;
  Resources: undefined;
  UploadResource: undefined;
  Faculty: undefined;
  Placement: undefined;
  AcademicCalendar: undefined;
  ClubDetail: { clubId: string; clubName: string };
  CreateClub: undefined;
  PostEvent: { clubId: string; clubName: string; editingEvent?: ClubEvent };
  PostNotice: { clubId?: string; clubName?: string; editingNotice?: Notice } | undefined;
  EditProfile: undefined;
  NotificationSettings: undefined;
  HelpSupport: undefined;
  About: undefined;
};
