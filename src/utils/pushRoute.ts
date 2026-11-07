// Works out which screen a notification should open, from its data (screen set by the server)
// or, for older pushes without one, from words in its title.
const TAB_SCREENS = new Set(["Home", "Timetable", "Notices", "Clubs", "Profile"]);
const STACK_SCREENS = new Set([
  "MessMenu", "ThaliPass", "ApplyLeave", "LeaveRequests", "SubmitComplaint", "Complaints", "Announcements", "Meetings",
  "Transcript", "Marks", "ExamSchedule", "ExamStatus", "MyAttendance", "SubmitEventExcusal", "EventExcusalRequests",
  "Resources", "Faculty", "Placement", "AcademicCalendar", "Events", "Counselling", "CounsellingQueue", "RoomAvailability",
  "Curriculum", "Notifications", "SOS", "SosAlerts", "ClubDetail",
]);

export type PushTarget = { name: string; params?: Record<string, unknown> };

function fromScreen(screen: string, data: Record<string, unknown>): PushTarget | null {
  if (TAB_SCREENS.has(screen)) return { name: "Tabs", params: { screen } };
  if (screen === "ClubDetail") {
    return typeof data.clubId === "string" ? { name: "ClubDetail", params: { clubId: data.clubId, clubName: String(data.clubName ?? "Club") } } : { name: "Events" };
  }
  if (STACK_SCREENS.has(screen)) return { name: screen };
  return null;
}

export function pushTarget(title: string | null | undefined, data: Record<string, unknown> | null | undefined, isFaculty = false): PushTarget | null {
  const d = data ?? {};
  if (typeof d.screen === "string") {
    const t = fromScreen(d.screen, d);
    if (t) return t;
  }
  const t = String(title ?? "").toLowerCase();
  if (!t) return null;
  if (/cancelled|room changed|is back on|timetable|class at|holiday|no class/.test(t)) return { name: "Tabs", params: { screen: "Timetable" } };
  if (/attendance|below 75/.test(t)) return { name: "MyAttendance" };
  if (/notice/.test(t)) return { name: "Tabs", params: { screen: "Notices" } };
  if (/exam/.test(t)) return { name: "ExamSchedule" };
  if (/grade|marks|result/.test(t)) return { name: "Marks" };
  if (/leave/.test(t)) return { name: isFaculty ? "LeaveRequests" : "ApplyLeave" };
  if (/excusal/.test(t)) return { name: isFaculty ? "EventExcusalRequests" : "SubmitEventExcusal" };
  if (/sos/.test(t)) return { name: isFaculty ? "SosAlerts" : "SOS" };
  if (/resource|notes|slides|pyq/.test(t)) return { name: "Resources" };
  if (/meeting/.test(t)) return { name: "Meetings" };
  if (/announcement/.test(t)) return { name: "Announcements" };
  if (/complaint|doubt/.test(t)) return { name: isFaculty ? "Complaints" : "SubmitComplaint" };
  if (/counsell/.test(t)) return { name: isFaculty ? "CounsellingQueue" : "Counselling" };
  if (/event|club/.test(t)) return { name: "Events" };
  return null;
}
