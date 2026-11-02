import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import HomeMeetings from "../HomeMeetings";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../../theme/theme";
import { useAuth } from "../../context/AuthContext";
import { getCurrentSemester } from "../../utils/academicInfo";
import {
  subscribeToTimetable,
  subscribeToFacultyTimetable,
  subscribeToAllTimetables,
  Timetable,
  TimetableSlot,
  FacultyScheduleEntry,
} from "../../firebase/timetableService";
import { mergeContiguousSlots, toMinutes } from "../../utils/timetable";
import { getRoomAvailability, fromMinutes } from "../../utils/roomAvailability";
import { subscribeToExamSchedules, ExamSchedule } from "../../firebase/examScheduleService";
import { subscribeToHolidayOverrides } from "../../firebase/holidayOverridesService";
import { getDayStatus } from "../../utils/dayStatus";
import { subscribeToNotices, Notice } from "../../firebase/noticesService";
import { subscribeToMyQuizzes, roomFor, Quiz } from "../../firebase/quizService";
import { subscribeToMessExtras, MessExtra, DEFAULT_MESS_EXTRAS } from "../../firebase/messExtrasService";
import { subscribeToMyLeaveApplications, approvalChain, APPROVER_LABEL, LeaveApplication, ApproverRole } from "../../firebase/leaveService";
import { subscribeToAllUpcomingEvents, ClubEvent } from "../../firebase/clubsService";
import { subscribeToActiveSos, SosAlert } from "../../firebase/sosService";
import { messMenu } from "../../data/messMenu";
import { expandFaculty } from "../../data/facultyLegend";
import { isInCabin, cabinSince } from "../../utils/cabin";
import { useAttendanceSummary } from "../../hooks/useAttendanceSummary";
import { ATTENDANCE_TARGET } from "../../firebase/attendanceService";
import { useWebBadges, markNoticesSeen } from "../../utils/webBadges";
import { useFacultyWaiting } from "../../hooks/useFacultyWaiting";

type Slot = TimetableSlot & { branch?: string; semester?: number; section?: string };
const pointer: any = { cursor: "pointer" };
function to12h(time: string): string {
  const m = toMinutes(time);
  if (m < 0) return time;
  const h = Math.floor(m / 60);
  const ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, "0")} ${ap}`;
}
function mins(n: number): string {
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
function isoToday(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysUntil(iso: string, now: Date): number {
  const [y, m, d] = iso.split("-").map(Number);
  const a = new Date(y, m - 1, d).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / 86400000);
}
function whenLabel(iso: string, now: Date): string {
  const n = daysUntil(iso, now);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n < 7) return `In ${n} days`;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function ago(ms: number, now: Date): string {
  const m = Math.floor((now.getTime() - ms) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

function useNow(ms = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function Card({ children, style, onPress, label }: { children: React.ReactNode; style?: any; onPress?: () => void; label?: string }) {
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={(st: any) => [s.card, pointer, st.hovered && s.cardHover, style]}>
      {children}
    </Pressable>
  );
}

function CardHead({ icon, title, action, onAction }: { icon: keyof typeof Ionicons.glyphMap; title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.headRow}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={s.headTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} style={pointer} hitSlop={8}>
          <Text style={s.headAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Ring({ pct }: { pct: number | null }) {
  const size = 112;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = pct ?? 0;
  const tone = pct === null ? colors.border : p >= ATTENDANCE_TARGET ? colors.success : colors.danger;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tone}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(c * Math.min(100, p)) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={s.ringPct}>{pct === null ? "–" : `${Math.round(p)}%`}</Text>
      <Text style={s.ringSub}>overall</Text>
    </View>
  );
}

export default function DesktopHome() {
  const navigation = useNavigation<any>();
  const go = (route: string, params?: object) => navigation.navigate(route, params);
  const { profile, previewRole, setInCabin } = useAuth();
  const isFaculty = (previewRole ?? profile?.role) === "faculty";
  const inCabinNow = isInCabin(profile?.inCabin, profile?.inCabinAt);
  const [cabinBusy, setCabinBusy] = useState(false);
  const toggleCabin = async () => {
    setCabinBusy(true);
    try {
      await setInCabin(!inCabinNow);
    } catch {
    } finally {
      setCabinBusy(false);
    }
  };
  const now = useNow();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const today = isoToday(now);
  const semester = profile?.admissionYear ? getCurrentSemester(profile.admissionYear, undefined, profile.program) : null;
  const attendance = useAttendanceSummary(profile, !isFaculty);

  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [facultyEntries, setFacultyEntries] = useState<FacultyScheduleEntry[]>([]);
  useEffect(() => {
    if (isFaculty) {
      if (!profile?.name) return;
      return subscribeToFacultyTimetable(profile.name, setFacultyEntries);
    }
    if (!profile?.branch || !profile?.section || !semester) return;
    return subscribeToTimetable(profile.branch, semester, profile.section, setTimetable);
  }, [isFaculty, profile?.name, profile?.branch, profile?.section, semester]);

  const [allTimetables, setAllTimetables] = useState<Timetable[]>([]);
  useEffect(() => subscribeToAllTimetables(setAllTimetables, () => setAllTimetables([])), []);

  const [exams, setExams] = useState<ExamSchedule[]>([]);
  useEffect(() => {
    if (isFaculty || !profile?.branch || !semester) return;
    return subscribeToExamSchedules(profile.branch, semester, setExams);
  }, [isFaculty, profile?.branch, semester]);

  const [holidays, setHolidays] = useState<Record<string, string>>({});
  useEffect(() => subscribeToHolidayOverrides(setHolidays), []);

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  useEffect(() => {
    if (isFaculty || !profile?.branch || !profile?.admissionYear) return;
    return subscribeToMyQuizzes({ branch: profile.branch, admissionYear: profile.admissionYear, section: profile.section ?? null }, setQuizzes);
  }, [isFaculty, profile?.branch, profile?.admissionYear, profile?.section]);

  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    const viewer =
      !isFaculty && profile
        ? { branch: profile.branch, section: profile.section, admissionYear: profile.admissionYear, specialization: profile.specialization }
        : undefined;
    return subscribeToNotices(setNotices, viewer);
  }, [isFaculty, profile?.branch, profile?.section, profile?.admissionYear, profile?.specialization]);

  const [events, setEvents] = useState<ClubEvent[]>([]);
  useEffect(() => subscribeToAllUpcomingEvents(setEvents), []);

  const [extras, setExtras] = useState<MessExtra[]>(DEFAULT_MESS_EXTRAS);
  useEffect(() => subscribeToMessExtras(setExtras), []);

  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  useEffect(() => {
    if (isFaculty || !profile?.uid) return;
    return subscribeToMyLeaveApplications(profile.uid, setLeaves);
  }, [isFaculty, profile?.uid]);

  const [activeSos, setActiveSos] = useState<SosAlert[]>([]);
  useEffect(() => {
    if (!isFaculty && !profile?.isAdmin) return;
    return subscribeToActiveSos(setActiveSos, () => setActiveSos([]));
  }, [isFaculty, profile?.isAdmin]);

  const { noticesSeenAt: seenAt } = useWebBadges();
  const waiting = useFacultyWaiting(profile?.email, isFaculty);

  const slots: Slot[] = useMemo(() => {
    const raw: Slot[] = isFaculty
      ? facultyEntries.filter((e) => e.day === todayName)
      : timetable?.days.find((d) => d.day === todayName)?.slots ?? [];
    return mergeContiguousSlots(raw)
      .filter((x) => toMinutes(x.startTime) >= 0)
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  }, [isFaculty, facultyEntries, timetable, todayName]);

  const dayStatus = getDayStatus(now, isFaculty ? [] : exams, holidays);
  const current = slots.find((x) => toMinutes(x.startTime) <= nowMin && nowMin < toMinutes(x.endTime)) ?? null;
  const upcoming = slots.filter((x) => toMinutes(x.startTime) > nowMin);
  const next = upcoming[0] ?? null;
  const hero = current ?? next;
  const heroGroup = hero
    ? slots.filter((x) => toMinutes(x.startTime) < toMinutes(hero.endTime) && toMinutes(x.endTime) > toMinutes(hero.startTime) && (x === hero || toMinutes(x.startTime) === toMinutes(hero.startTime)))
    : [];
  const parallel = heroGroup.length > 1;
  const groupName = (x: Slot, i: number) => (x.group ? x.group.replace(/^group\s*/i, "Group ") : `Group ${i + 1}`);

  const freeRooms = useMemo(() => {
    if (!allTimetables.length) return [];
    return getRoomAvailability(allTimetables, todayName, fromMinutes(nowMin))
      .filter((r) => !r.occupant)
      .map((r) => r.room);
  }, [allTimetables, todayName, nowMin]);

  const nextQuiz = quizzes[0] ?? null;
  const quizRoom = nextQuiz ? roomFor(nextQuiz, profile?.enrollmentNumber) : null;
  const nextExam = useMemo(() => {
    const all = exams.flatMap((e) => e.entries.map((x) => ({ ...x, label: e.examTypeLabel })));
    return all.filter((x) => x.date >= today).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0] ?? null;
  }, [exams, today]);
  const nextEvent = events[0] ?? null;

  const lunch = messMenu.find((d) => d.day === todayName)?.meals.Lunch ?? null;

  const medical = leaves.find((l) => l.type === "medical" && l.status === "pending") ?? null;
  const m2 = medical && (medical as any).flow === 2 ? (medical as any) : null;
  const signed2 = m2 ? ["hodSign", "deanSign", "jrSign"].filter((k) => m2[k]).length : 0;
  const chain: string[] = m2 ? ["Office", "Medical Officer", "HOD", "Dean", "Joint Registrar"] : medical ? approvalChain(medical).map((c) => APPROVER_LABEL[c]) : [];
  const stage = medical?.stage as string | undefined;
  const stepIdx = m2
    ? ({ office: 0, returned: 0, medical: 1, signoff: 2 + signed2 } as Record<string, number>)[m2.stage] ?? chain.length
    : medical
      ? stage === "teachers"
        ? chain.length
        : Math.max(0, approvalChain(medical).indexOf(stage as ApproverRole))
      : 0;
  const medicalLine = m2
    ? m2.stage === "returned"
      ? `Returned: ${m2.returnNote ?? "fix and resubmit"}`
      : m2.stage === "signoff"
        ? `${m2.refNo} · ${signed2} of 3 signatures (HOD, Dean, JR)`
        : `${m2.refNo} · with the ${m2.stage === "office" ? "Academic Office" : "Medical Officer"}`
    : stage === "teachers"
      ? "Approved. Teachers are confirming the classes."
      : `Step ${stepIdx + 1} of ${chain.length}: waiting for the ${chain[stepIdx] ?? "approver"}`;

  const unread = notices.filter((n) => (n.createdAt?.toMillis?.() ?? 0) > seenAt);
  const firstName = (profile?.name ?? "").replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "").split(" ")[0] || "there";
  const greet = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const left = slots.filter((x) => toMinutes(x.endTime) > nowMin).length;

  const who = (x: Slot) =>
    isFaculty
      ? [x.branch, x.semester ? `Sem ${x.semester}` : null, x.section && x.section !== x.branch ? x.section : null].filter(Boolean).join(" · ")
      : expandFaculty(x.faculty ?? "");

  const heroProgress = current
    ? Math.min(1, (nowMin - toMinutes(current.startTime)) / Math.max(1, toMinutes(current.endTime) - toMinutes(current.startTime)))
    : 0;
  const afterCurrent = current ? upcoming.find((x) => !heroGroup.includes(x) && toMinutes(x.startTime) >= Math.max(...heroGroup.map((g) => toMinutes(g.endTime)))) ?? null : null;

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <View style={s.wrap}>
        <View style={s.greetRow}>
          <View style={{ flex: 1, minWidth: 280 }}>
            <Text style={s.date}>{dateLabel}</Text>
            <Text style={s.greet}>
              {greet}, {firstName}
            </Text>
          </View>
          <View style={s.chips}>
            {isFaculty ? (
              <Pressable
                onPress={toggleCabin}
                disabled={cabinBusy}
                style={[s.chip, s.cabinChip, inCabinNow && s.cabinChipOn, pointer, cabinBusy && { opacity: 0.6 }]}
                accessibilityRole="switch"
                accessibilityState={{ checked: inCabinNow }}
              >
                <View style={[s.cabinDot, inCabinNow && { backgroundColor: colors.success }]} />
                <Text style={[s.chipText, inCabinNow && { color: colors.successFg }]}>
                  {inCabinNow ? `In cabin since ${cabinSince(profile?.inCabinAt) ?? "now"} · tap to leave` : "Mark me in cabin"}
                </Text>
              </Pressable>
            ) : null}
            {dayStatus ? (
              <View style={s.chip}>
                <Text style={s.chipText}>{dayStatus.label}</Text>
              </View>
            ) : (
              <View style={s.chip}>
                <Ionicons name="time-outline" size={14} color={colors.primary} />
                <Text style={s.chipText}>{left ? `${left} ${left === 1 ? "class" : "classes"} left today` : "No more classes today"}</Text>
              </View>
            )}
            {!isFaculty && attendance?.low ? (
              <Pressable onPress={() => go("MyAttendance")} style={[s.chip, s.chipWarn, pointer]}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                <Text style={[s.chipText, { color: colors.danger }]}>
                  {attendance.low} {attendance.low === 1 ? "subject" : "subjects"} below {ATTENDANCE_TARGET}%
                </Text>
              </Pressable>
            ) : null}
            {unread.length ? (
              <Pressable onPress={() => go("Notices")} style={[s.chip, pointer]}>
                <View style={s.dot} />
                <Text style={s.chipText}>
                  {unread.length} unread {unread.length === 1 ? "notice" : "notices"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <HomeMeetings onOpenAll={() => go("Meetings" as any)} style={{ maxWidth: 720 }} />

        {activeSos.length > 0 && (
          <Pressable onPress={() => go("SosAlerts")} style={[s.sosBanner, pointer]}>
            <Ionicons name="alert-circle" size={22} color="#FFFFFF" />
            <Text style={s.sosText}>
              {activeSos.length === 1 ? `SOS from ${activeSos[0].studentName}` : `${activeSos.length} active SOS alerts`} · open for location and phone
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
          </Pressable>
        )}

        <View style={s.row}>
          <Pressable onPress={() => go("Timetable")} style={(st: any) => [s.hero, pointer, st.hovered && { opacity: 0.96 }]}>
            {dayStatus ? (
              <>
                <Text style={s.heroKicker}>TODAY</Text>
                <Text style={s.heroTitle}>{dayStatus.label}</Text>
                <Text style={s.heroSub}>No regular classes today.</Text>
              </>
            ) : hero ? (
              <>
                <View style={s.heroTop}>
                  <Text style={s.heroKicker}>{current ? "HAPPENING NOW" : "UP NEXT"}</Text>
                  <View style={s.heroPill}>
                    <Text style={s.heroPillText}>
                      {current
                        ? `ends in ${mins(toMinutes(current.endTime) - nowMin)}`
                        : `starts in ${mins(toMinutes(hero.startTime) - nowMin)}`}
                    </Text>
                  </View>
                </View>
                {parallel ? (
                  <>
                    <Text style={s.heroSub}>
                      {`${to12h(hero.startTime)} – ${to12h(hero.endTime)}`} · split into {heroGroup.length} groups
                    </Text>
                    <View style={s.heroGroups}>
                      {heroGroup.map((g, i) => (
                        <View key={`${g.id}-${i}`} style={s.heroGroupItem}>
                          <Text style={s.heroGroupLabel}>{groupName(g, i).toUpperCase()}</Text>
                          <Text style={s.heroGroupTitle} numberOfLines={2}>
                            {g.subjectName}
                          </Text>
                          <Text style={s.heroGroupMeta} numberOfLines={2}>
                            {[g.room, who(g)].filter(Boolean).join(" · ")}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={s.heroTitle} numberOfLines={2}>
                      {hero.subjectName}
                    </Text>
                    <Text style={s.heroSub}>
                      {[hero.room, who(hero), `${to12h(hero.startTime)} – ${to12h(hero.endTime)}`].filter(Boolean).join("  ·  ")}
                    </Text>
                  </>
                )}
                {current ? (
                  <View style={s.heroTrack}>
                    <View style={[s.heroFill, { width: `${Math.round(heroProgress * 100)}%` }]} />
                  </View>
                ) : null}
                {afterCurrent ? (
                  <Text style={s.heroNext}>
                    Then {afterCurrent.subjectName} at {to12h(afterCurrent.startTime)}
                    {afterCurrent.room ? ` in ${afterCurrent.room}` : ""}
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={s.heroKicker}>TODAY</Text>
                <Text style={s.heroTitle}>{slots.length ? "You're done for the day" : "No classes today"}</Text>
                <Text style={s.heroSub}>
                  {nextQuiz ? `Next up: ${nextQuiz.title} ${whenLabel(nextQuiz.date, now).toLowerCase()}.` : "Enjoy the free time."}
                </Text>
              </>
            )}
          </Pressable>

          {isFaculty ? (
            <Card style={s.col1} onPress={() => go("MarkAttendance")} label="Mark attendance">
              <CardHead icon="checkmark-done-outline" title="Attendance" />
              <Text style={s.big}>{current ? current.subjectName : "Mark a class"}</Text>
              <Text style={s.muted}>{current ? "Class in progress. Mark it before you forget." : "Open the register for any of your classes."}</Text>
              <View style={s.cta}>
                <Text style={s.ctaText}>Open register</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.primary} />
              </View>
            </Card>
          ) : (
            <Card style={s.col1} onPress={() => go("MyAttendance")} label="Attendance">
              <CardHead icon="checkmark-done-outline" title="Attendance" />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
                <Ring pct={attendance?.overall ?? null} />
                <View style={{ flex: 1, gap: 6 }}>
                  {attendance?.lowSubjects?.length ? (
                    attendance.lowSubjects.slice(0, 3).map((l) => (
                      <View key={l.code} style={s.lowRow}>
                        <Text style={s.lowName} numberOfLines={1}>
                          {l.name}
                        </Text>
                        <Text style={s.lowPct}>{l.pct}%</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={s.muted}>{attendance?.overall == null ? "Shows up once a class is marked." : `All subjects at ${ATTENDANCE_TARGET}% or above.`}</Text>
                  )}
                </View>
              </View>
              <View style={s.cta}>
                <Text style={s.ctaText}>Plan your skips</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.primary} />
              </View>
            </Card>
          )}
        </View>

        <View style={s.row}>
          <Card style={s.col1}>
            <CardHead icon="calendar-outline" title="Today's classes" action="Full week" onAction={() => go("Timetable")} />
            {slots.length === 0 ? (
              <Text style={s.muted}>{dayStatus ? dayStatus.label : "Nothing on the timetable today."}</Text>
            ) : (
              slots.map((x, i) => {
                const done = toMinutes(x.endTime) <= nowMin;
                const isNow = !!current && heroGroup.includes(x);
                const isNext = !current && heroGroup.includes(x);
                return (
                  <View key={`${x.id}-${i}`} style={[s.classRow, isNow && s.classRowNow, done && { opacity: 0.5 }]}>
                    <Text style={s.classTime}>{to12h(x.startTime)}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.className} numberOfLines={1}>
                        {x.subjectName}
                        {x.group ? ` · ${x.group}` : ""}
                      </Text>
                      <Text style={s.classMeta} numberOfLines={1}>
                        {[x.room, who(x)].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    {done ? <Text style={s.tagDone}>DONE</Text> : isNow ? <Text style={s.tagNow}>NOW</Text> : isNext ? <Text style={s.tagNext}>NEXT</Text> : null}
                  </View>
                );
              })
            )}
          </Card>

          <Card style={s.col1}>
            <CardHead icon="flag-outline" title="Coming up" />
            {!isFaculty && nextQuiz ? (
              <Pressable onPress={() => go("ExamSchedule")} style={[s.upRow, pointer]}>
                <View style={[s.upIcon, { backgroundColor: colors.badge.purple.bg }]}>
                  <Ionicons name="create-outline" size={18} color={colors.badge.purple.fg} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.upTitle} numberOfLines={1}>
                    {nextQuiz.title} · {nextQuiz.subjectName}
                  </Text>
                  <Text style={s.upMeta} numberOfLines={1}>
                    {whenLabel(nextQuiz.date, now)}, {to12h(nextQuiz.startTime)}
                    {quizRoom ? ` · your room ${quizRoom.room}` : ""}
                  </Text>
                </View>
              </Pressable>
            ) : null}
            {!isFaculty && nextExam ? (
              <Pressable onPress={() => go("ExamSchedule")} style={[s.upRow, pointer]}>
                <View style={[s.upIcon, { backgroundColor: colors.badge.peach.bg }]}>
                  <Ionicons name="reader-outline" size={18} color={colors.badge.peach.fg} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.upTitle} numberOfLines={1}>
                    {nextExam.label}: {nextExam.subjectName}
                  </Text>
                  <Text style={s.upMeta} numberOfLines={1}>
                    {daysUntil(nextExam.date, now) > 1 ? `${daysUntil(nextExam.date, now)} days to go` : whenLabel(nextExam.date, now)}
                    {nextExam.venue ? ` · ${nextExam.venue}` : ""}
                  </Text>
                </View>
              </Pressable>
            ) : null}
            {nextEvent ? (
              <Pressable onPress={() => go("ClubDetail", { clubId: nextEvent.clubId, clubName: nextEvent.clubName })} style={[s.upRow, pointer]}>
                <View style={[s.upIcon, { backgroundColor: colors.badge.green.bg }]}>
                  <Ionicons name="people-outline" size={18} color={colors.badge.green.fg} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.upTitle} numberOfLines={1}>
                    {nextEvent.title}
                  </Text>
                  <Text style={s.upMeta} numberOfLines={1}>
                    {nextEvent.clubName} · {whenLabel(isoToday(nextEvent.dateTime.toDate()), now)}
                  </Text>
                </View>
              </Pressable>
            ) : null}
            {!nextEvent && (isFaculty || (!nextQuiz && !nextExam)) ? <Text style={s.muted}>Nothing scheduled yet.</Text> : null}
          </Card>

          <Card style={s.col1}>
            <CardHead icon="business-outline" title="Free right now" action="Find a room" onAction={() => go("RoomAvailability")} />
            {freeRooms.length === 0 ? (
              <Text style={s.muted}>{allTimetables.length ? "Every room is in use right now." : "Loading rooms…"}</Text>
            ) : (
              <>
                <Text style={s.muted}>
                  {freeRooms.length} {freeRooms.length === 1 ? "room" : "rooms"} empty at {to12h(fromMinutes(nowMin))}
                </Text>
                <View style={s.roomWrap}>
                  {freeRooms.slice(0, 12).map((r) => (
                    <View key={r} style={s.room}>
                      <Text style={s.roomText}>{r}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </Card>
        </View>

        <View style={s.row}>
          <Card style={s.col1} onPress={() => go("MessMenu")} label="Mess menu">
            <CardHead icon="restaurant-outline" title="Lunch today" />
            {lunch ? (
              <Text style={s.lunch}>{lunch.join(" · ")}</Text>
            ) : (
              <Text style={s.muted}>No lunch menu today.</Text>
            )}
            <Text style={s.subHead}>ALWAYS AVAILABLE</Text>
            <View style={s.roomWrap}>
              {extras.map((x) => (
                <View key={x.id} style={s.extra}>
                  <Text style={s.extraText}>
                    {x.name}
                    {x.price != null ? ` ₹${x.price}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          <Card style={s.col1}>
            <CardHead
              icon="notifications-outline"
              title="Notices"
              action={unread.length ? "Mark all read" : "See all"}
              onAction={() => {
                if (unread.length) markNoticesSeen();
                else go("Notices");
              }}
            />
            {notices.length === 0 ? (
              <Text style={s.muted}>No notices yet.</Text>
            ) : (
              notices.slice(0, 4).map((n) => {
                const isUnread = (n.createdAt?.toMillis?.() ?? 0) > seenAt;
                return (
                  <Pressable key={n.id} onPress={() => go("Notices")} style={[s.noticeRow, pointer]}>
                    <View style={[s.dot, !isUnread && { backgroundColor: "transparent" }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.noticeTitle, isUnread && { fontWeight: "800" }]} numberOfLines={1}>
                        {n.title}
                      </Text>
                      <Text style={s.upMeta} numberOfLines={1}>
                        {[n.clubName ?? n.category, n.createdAt ? ago(n.createdAt.toMillis(), now) : null].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </Card>

          {!isFaculty ? (
            <Card style={s.col1} onPress={() => go("ApplyLeave")} label="Leave">
              <CardHead icon="document-text-outline" title="Leave" />
              {medical ? (
                <>
                  <Text style={s.big}>Medical leave</Text>
                  <Text style={s.muted}>{medicalLine}</Text>
                  <View style={s.steps}>
                    {chain.map((c, i) => (
                      <View key={c} style={[s.step, i < stepIdx && { backgroundColor: colors.success }, i === stepIdx && { backgroundColor: colors.primary }]} />
                    ))}
                  </View>
                  <Text style={s.upMeta}>{chain.join("  →  ")}</Text>
                </>
              ) : (
                <>
                  <Text style={s.big}>No leave in progress</Text>
                  <Text style={s.muted}>Sick or going home? Apply in under a minute and track every step here.</Text>
                  <View style={s.cta}>
                    <Text style={s.ctaText}>Apply for leave</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                  </View>
                </>
              )}
            </Card>
          ) : (
            <Card style={s.col1} onPress={() => go("LeaveRequests")} label="Leave requests">
              <CardHead icon="mail-open-outline" title="Waiting on you" />
              {waiting === null ? (
                <Text style={s.muted}>Checking your requests…</Text>
              ) : waiting.total === 0 ? (
                <>
                  <Text style={s.big}>All caught up</Text>
                  <Text style={s.muted}>No leave requests or class confirmations need you right now.</Text>
                </>
              ) : (
                <>
                  <Text style={s.big}>
                    {waiting.total} {waiting.total === 1 ? "request needs" : "requests need"} you
                  </Text>
                  <Text style={s.muted}>
                    {[
                      waiting.leave ? `${waiting.leave} leave ${waiting.leave === 1 ? "approval" : "approvals"}` : null,
                      waiting.acks ? `${waiting.acks} medical-leave ${waiting.acks === 1 ? "class" : "classes"} to confirm` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </>
              )}
              <View style={s.cta}>
                <Text style={s.ctaText}>Open requests</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.primary} />
              </View>
            </Card>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 48 },
  wrap: { width: "100%", maxWidth: 1180, alignSelf: "center", gap: 18 },
  greetRow: { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", gap: 14 },
  date: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
  greet: { fontSize: 32, fontWeight: "800", letterSpacing: -0.8, color: colors.textPrimary, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cabinChip: { borderWidth: 1, borderColor: colors.border },
  cabinChipOn: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
  cabinDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.textSecondary },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipWarn: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  sosBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.danger, borderRadius: 16, padding: 16 },
  sosText: { flex: 1, color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "stretch" },
  col1: { flexGrow: 1, flexBasis: 300, minWidth: 280 },
  card: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: 22, padding: 20, gap: 12 },
  cardHover: { borderColor: colors.borderStrong },
  headRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headTitle: { flex: 1, fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  headAction: { fontSize: 13, fontWeight: "700", color: colors.primary },
  hero: { flexGrow: 2, flexBasis: 600, minWidth: 320, backgroundColor: colors.heroBg, borderRadius: 22, padding: 26, gap: 10, justifyContent: "center" },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  heroKicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1, color: "#7CE3A5" },
  heroPill: { backgroundColor: colors.heroChip, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  heroPillText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  heroTitle: { fontSize: 30, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.6 },
  heroSub: { fontSize: 15, color: colors.heroMuted, fontWeight: "600" },
  heroTrack: { height: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", marginTop: 6, overflow: "hidden" },
  heroFill: { height: 8, borderRadius: 999, backgroundColor: "#7CE3A5" },
  heroGroups: { flexDirection: "row", gap: 12, marginTop: 6, flexWrap: "wrap" },
  heroGroupItem: { flex: 1, minWidth: 220, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 14, gap: 2 },
  heroGroupLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, color: "#7CE3A5" },
  heroGroupTitle: { fontSize: 20, fontWeight: "800", color: "#FFFFFF" },
  heroGroupMeta: { fontSize: 13, fontWeight: "600", color: colors.heroMuted },
  heroNext: { fontSize: 14, color: colors.heroMuted, marginTop: 4 },
  big: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  muted: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  cta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: "auto" as any },
  ctaText: { fontSize: 14, fontWeight: "800", color: colors.primary },
  ringPct: { fontSize: 24, fontWeight: "800", color: colors.textPrimary },
  ringSub: { fontSize: 11, color: colors.textSecondary, fontWeight: "700" },
  lowRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  lowName: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  lowPct: { fontSize: 13, fontWeight: "800", color: colors.danger },
  classRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12 },
  classRowNow: { backgroundColor: colors.badge.blue.bg },
  classTime: { width: 72, fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  className: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  classMeta: { fontSize: 12, color: colors.textSecondary },
  tagDone: { fontSize: 11, fontWeight: "800", color: colors.textSecondary },
  tagNow: { fontSize: 11, fontWeight: "800", color: colors.onPrimary, backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tagNext: { fontSize: 11, fontWeight: "800", color: colors.primary },
  upRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  upIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  upTitle: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  upMeta: { fontSize: 12, color: colors.textSecondary },
  roomWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  room: { backgroundColor: colors.successBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  roomText: { fontSize: 13, fontWeight: "800", color: colors.successFg },
  lunch: { fontSize: 14, color: colors.textPrimary, lineHeight: 21, fontWeight: "600" },
  subHead: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, color: colors.textSecondary, marginTop: 4 },
  extra: { backgroundColor: colors.badge.peach.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  extraText: { fontSize: 13, fontWeight: "700", color: colors.badge.peach.fg },
  noticeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  noticeTitle: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  steps: { flexDirection: "row", gap: 6 },
  step: { flex: 1, height: 8, borderRadius: 999, backgroundColor: colors.surfaceAlt },
});
