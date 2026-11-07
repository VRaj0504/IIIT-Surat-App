import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, ScrollView, TextInput, Modal, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, radius } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { useWebLayout } from "../utils/useWebLayout";
import { useWebBadges, markNoticesSeen } from "../utils/webBadges";
import { useInboxUnread } from "../hooks/useInboxUnread";
import { openFacultyPortal } from "../utils/portal";
import { useFacultyWaiting } from "../hooks/useFacultyWaiting";
import { subscribeToNotices, Notice } from "../firebase/noticesService";

type IconName = keyof typeof Ionicons.glyphMap;
type Item = { label: string; icon: IconName; tab?: string; route?: string; keywords?: string };
type Group = { title?: string; items: Item[] };

const STUDENT_NAV: Group[] = [
  {
    items: [
      { label: "Today", icon: "home-outline", tab: "Home", keywords: "home dashboard" },
      { label: "Timetable", icon: "calendar-outline", tab: "Timetable", keywords: "classes schedule" },
      { label: "Attendance", icon: "checkmark-done-outline", route: "MyAttendance", keywords: "skip planner percentage bunk" },
      { label: "Exams & quizzes", icon: "reader-outline", route: "ExamSchedule", keywords: "date sheet quiz midsem endsem" },
      { label: "Exam status", icon: "ribbon-outline", route: "ExamStatus", keywords: "backlog supplementary cgpa" },
      { label: "My marks", icon: "stats-chart-outline", route: "Marks", keywords: "quiz midsem marks score internal" },
      { label: "Transcript", icon: "school-outline", route: "Transcript", keywords: "grades sgpa cgpa results" },
      { label: "Empty classrooms", icon: "business-outline", route: "RoomAvailability", keywords: "free room study" },
      { label: "Mess", icon: "restaurant-outline", route: "MessMenu", keywords: "food lunch menu maggi chai" },
    ],
  },
  {
    title: "STUDY",
    items: [
      { label: "Resources", icon: "book-outline", route: "Resources", keywords: "notes pyq papers slides" },
      { label: "Curriculum", icon: "library-outline", route: "Curriculum", keywords: "subjects credits syllabus" },
      { label: "Academic calendar", icon: "calendar-number-outline", route: "AcademicCalendar", keywords: "holidays semester dates" },
    ],
  },
  {
    title: "CAMPUS",
    items: [
      { label: "Notices", icon: "notifications-outline", tab: "Notices", keywords: "news updates" },
      { label: "Notification history", icon: "file-tray-full-outline", route: "Notifications", keywords: "bell alerts push inbox" },
      { label: "Clubs & events", icon: "people-outline", tab: "Clubs", keywords: "club event fest" },
      { label: "Announcements", icon: "megaphone-outline", route: "Announcements", keywords: "class updates" },
      { label: "Meetings", icon: "people-circle-outline", route: "Meetings", keywords: "director meeting called" },
      { label: "Faculty directory", icon: "id-card-outline", route: "Faculty", keywords: "teacher cabin phone email" },
      { label: "Placements", icon: "briefcase-outline", route: "Placement", keywords: "tnp jobs internship" },
    ],
  },
  {
    title: "REQUESTS",
    items: [
      { label: "Leave", icon: "document-text-outline", route: "ApplyLeave", keywords: "medical casual leave apply" },
      { label: "Event excusal", icon: "ribbon-outline", route: "SubmitEventExcusal", keywords: "od duty event attendance" },
      { label: "Complaints & doubts", icon: "chatbubble-ellipses-outline", route: "SubmitComplaint", keywords: "complaint doubt issue" },
      { label: "Counselling", icon: "heart-outline", route: "Counselling", keywords: "wellness talk" },
    ],
  },
];

const FACULTY_NAV: Group[] = [
  {
    items: [
      { label: "Today", icon: "home-outline", tab: "Home", keywords: "home dashboard" },
      { label: "Timetable", icon: "calendar-outline", tab: "Timetable", keywords: "classes schedule" },
      { label: "Mark attendance", icon: "checkmark-done-outline", route: "MarkAttendance", keywords: "attendance present absent" },
      { label: "Faculty portal", icon: "open-outline", route: "__portal", keywords: "grades marks upload timetable curriculum portal web" },
      { label: "Empty classrooms", icon: "business-outline", route: "RoomAvailability", keywords: "free room" },
    ],
  },
  {
    title: "REQUESTS",
    items: [
      { label: "Leave requests", icon: "mail-open-outline", route: "LeaveRequests", keywords: "leave medical approve" },
      { label: "Excusal requests", icon: "ribbon-outline", route: "EventExcusalRequests", keywords: "od event" },
      { label: "Complaints & doubts", icon: "chatbubble-ellipses-outline", route: "Complaints", keywords: "complaint doubt" },
      { label: "Counselling requests", icon: "heart-outline", route: "CounsellingQueue", keywords: "wellness" },
      { label: "SOS alerts", icon: "alert-circle-outline", route: "SosAlerts", keywords: "emergency" },
    ],
  },
  {
    title: "CAMPUS",
    items: [
      { label: "Notices", icon: "notifications-outline", tab: "Notices", keywords: "news" },
      { label: "Notification history", icon: "file-tray-full-outline", route: "Notifications", keywords: "bell alerts push inbox" },
      { label: "Announcements", icon: "megaphone-outline", route: "Announcements", keywords: "notify class" },
      { label: "Meetings", icon: "people-circle-outline", route: "Meetings", keywords: "director meeting called" },
      { label: "Clubs & events", icon: "people-outline", tab: "Clubs", keywords: "club" },
      { label: "Resources", icon: "book-outline", route: "Resources", keywords: "notes upload" },
      { label: "Faculty directory", icon: "id-card-outline", route: "Faculty", keywords: "teacher" },
      { label: "Mess", icon: "restaurant-outline", route: "MessMenu", keywords: "food" },
    ],
  },
];

type Props = {
  navigationRef: { navigate: (...args: any[]) => void; isReady: () => boolean };
  currentRoute: string | undefined;
  children: React.ReactNode;
};

const pointer: any = { cursor: "pointer" };

export default function WebShell({ navigationRef, currentRoute, children }: Props) {
  const { isDesktop } = useWebLayout();
  const { user, profile, previewRole, logOut } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const signedIn = !!user && !!profile;
  const isFaculty = (previewRole ?? profile?.role) === "faculty";
  const badges = useWebBadges();
  const waiting = useFacultyWaiting(profile?.email, isDesktop && signedIn && isFaculty);
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    if (!isDesktop || !signedIn) return;
    const viewer =
      !isFaculty && profile
        ? { branch: profile.branch, section: profile.section, admissionYear: profile.admissionYear, specialization: profile.specialization }
        : undefined;
    return subscribeToNotices(setNotices, viewer);
  }, [isDesktop, signedIn, isFaculty, profile?.branch, profile?.section, profile?.admissionYear, profile?.specialization]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (currentRoute === "Notices") markNoticesSeen();
  }, [currentRoute, notices.length]);
  const unreadNotices = notices.filter((n) => (n.createdAt?.toMillis?.() ?? 0) > badges.noticesSeenAt).length;
  const inboxUnread = useInboxUnread();
  const badgeFor = (i: Item): { n: number; tone: "red" | "orange" | "blue" } | null => {
    if (i.route === "Notifications" && inboxUnread) return { n: inboxUnread, tone: "blue" };
    if (i.tab === "Notices" && unreadNotices) return { n: unreadNotices, tone: "orange" };
    if (i.route === "MyAttendance" && badges.lowAttendance) return { n: badges.lowAttendance, tone: "red" };
    if (i.route === "LeaveRequests" && waiting?.total) return { n: waiting.total, tone: "blue" };
    return null;
  };
  const groups = isFaculty ? FACULTY_NAV : STUDENT_NAV;
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? allItems.filter((i) => `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(q))
      : allItems;
    return [...list, { label: "Emergency SOS", icon: "warning-outline" as IconName, route: "SOS", keywords: "sos" }]
      .filter((i, idx, arr) => arr.findIndex((x) => x.label === i.label) === idx)
      .filter((i) => !q || `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allItems, query]);

  const go = (item: Item) => {
    if (!navigationRef.isReady()) return;
    if (item.route === "__portal") {
      openFacultyPortal();
      return;
    }
    if (item.tab) navigationRef.navigate("Tabs", { screen: item.tab });
    else if (item.route) navigationRef.navigate(item.route);
    setPaletteOpen(false);
    setQuery("");
  };

  useEffect(() => {
    if (Platform.OS !== "web" || !isDesktop || !signedIn) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        setQuery("");
        setCursor(0);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, signedIn]);

  if (!isDesktop) {
    if (Platform.OS !== "web") return <>{children}</>;
    return (
      <View style={styles.phoneFrame}>
        <View style={styles.phoneColumn}>{children}</View>
      </View>
    );
  }
  if (!signedIn) {
    return (
      <View style={styles.page}>
        <View style={styles.brandPanel}>
          <View style={styles.brandTop}>
            <Image source={require("../../assets/icon.png")} style={styles.logo} />
            <Text style={styles.brandPanelName}>CollegeGo</Text>
            <Text style={styles.brandPanelTag}>Campus app</Text>
          </View>
          <View style={{ gap: 28, maxWidth: 520 }}>
            <Text style={styles.brandHeadline}>Your whole college day, on one screen.</Text>
            <View style={{ gap: 16 }}>
              {[
                { icon: "time-outline" as IconName, t: "Know your next class and room the moment you open it" },
                { icon: "checkmark-done-outline" as IconName, t: "See how many classes you can skip and stay above 75%" },
                { icon: "document-text-outline" as IconName, t: "Apply for leave and watch every approval step" },
                { icon: "business-outline" as IconName, t: "Find an empty classroom, the mess menu and every notice" },
              ].map((f) => (
                <View key={f.t} style={styles.feature}>
                  <View style={styles.featureIcon}>
                    <Ionicons name={f.icon} size={18} color="#7CE3A5" />
                  </View>
                  <Text style={styles.featureText}>{f.t}</Text>
                </View>
              ))}
            </View>
            <View style={styles.preview} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={styles.previewTop}>
                <Text style={styles.previewKicker}>HAPPENING NOW</Text>
                <View style={styles.previewPill}>
                  <Text style={styles.previewPillText}>ends in 24 min</Text>
                </View>
              </View>
              <Text style={styles.previewTitle}>Data Structures</Text>
              <Text style={styles.previewSub}>Room 204 · 10:00 – 10:55 AM</Text>
              <View style={styles.previewTrack}>
                <View style={styles.previewFill} />
              </View>
            </View>
          </View>
          <Text style={styles.brandFoot}>For students and faculty</Text>
        </View>
        <View style={styles.signedOutBody}>
          <View style={styles.signedOutColumn}>{children}</View>
        </View>
      </View>
    );
  }

  const isActive = (i: Item) => (i.tab ? currentRoute === i.tab : currentRoute === i.route);
  const initials = (profile?.name ?? "")
    .replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

  return (
    <View style={styles.page}>
      <View style={styles.sidebar}>
        <Pressable style={[styles.brand, pointer]} onPress={() => go({ label: "Today", icon: "home-outline", tab: "Home" })}>
          <Image source={require("../../assets/icon.png")} style={styles.logo} />
          <View>
            <Image source={require("../../assets/wordmark.png")} style={styles.wordmark} resizeMode="contain" accessibilityLabel="CollegeGo" />
            <Text style={styles.brandSub}>Campus app</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => {
            setPaletteOpen(true);
            setQuery("");
            setCursor(0);
          }}
          style={(s: any) => [styles.searchBtn, pointer, s.hovered && styles.searchBtnHover]}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <Text style={styles.searchText}>Search</Text>
          <Text style={styles.kbd}>Ctrl K</Text>
        </Pressable>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.md }} showsVerticalScrollIndicator={false}>
          {groups.map((g, gi) => (
            <View key={gi}>
              {g.title ? <Text style={styles.groupTitle}>{g.title}</Text> : null}
              {g.items.map((i) => {
                const active = isActive(i);
                return (
                  <Pressable
                    key={i.label}
                    onPress={() => go(i)}
                    accessibilityRole="link"
                    accessibilityState={{ selected: active }}
                    style={(s: any) => [styles.navItem, pointer, s.hovered && !active && styles.navItemHover, active && styles.navItemActive]}
                  >
                    <Ionicons name={i.icon} size={18} color={active ? colors.primary : colors.textPrimary} />
                    <Text style={[styles.navText, active && styles.navTextActive]}>{i.label}</Text>
                    {(() => {
                      const b = badgeFor(i);
                      if (!b) return null;
                      const tone = b.tone === "red" ? styles.badgeRed : b.tone === "orange" ? styles.badgeOrange : styles.badgeBlue;
                      return (
                        <View style={[styles.badge, tone]} accessibilityLabel={`${b.n} new`}>
                          <Text style={styles.badgeText}>{b.n > 99 ? "99+" : b.n}</Text>
                        </View>
                      );
                    })()}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>

        {!isFaculty && (
          <Pressable
            onPress={() => go({ label: "SOS", icon: "warning-outline", route: "SOS" })}
            style={(s: any) => [styles.sos, pointer, s.hovered && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <Ionicons name="warning-outline" size={18} color={colors.dangerText} />
            <Text style={styles.sosText}>Emergency SOS</Text>
          </Pressable>
        )}

        <View style={styles.me}>
          <Pressable
            style={[styles.meMain, pointer]}
            onPress={() => go({ label: "Profile", icon: "person-outline", tab: "Profile" })}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.meName} numberOfLines={1}>
                {profile?.name}
              </Text>
              <Text style={styles.meSub} numberOfLines={1}>
                {isFaculty ? profile?.department ?? "Faculty" : profile?.enrollmentNumber}
              </Text>
            </View>
          </Pressable>
          <Pressable onPress={() => logOut()} style={(s: any) => [styles.logout, pointer, s.hovered && styles.navItemHover]} accessibilityLabel="Log out">
            <Ionicons name="log-out-outline" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.main}>{children}</View>

      <Modal visible={paletteOpen} transparent animationType="fade" onRequestClose={() => setPaletteOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPaletteOpen(false)}>
          <Pressable style={styles.palette} onPress={() => undefined}>
            <View style={styles.paletteInputRow}>
              <Ionicons name="search" size={20} color={colors.textSecondary} />
              <TextInput
                autoFocus
                value={query}
                onChangeText={(t) => {
                  setQuery(t);
                  setCursor(0);
                }}
                onKeyPress={(e: any) => {
                  const k = e.nativeEvent.key;
                  if (k === "ArrowDown") setCursor((c) => Math.min(results.length - 1, c + 1));
                  if (k === "ArrowUp") setCursor((c) => Math.max(0, c - 1));
                }}
                onSubmitEditing={() => results[cursor] && go(results[cursor])}
                placeholder="Where do you want to go?"
                placeholderTextColor={colors.textSecondary}
                style={styles.paletteInput}
                accessibilityLabel="Search pages"
              />
              <Text style={styles.kbd}>Esc</Text>
            </View>
            <View style={{ padding: spacing.sm }}>
              {results.length === 0 ? (
                <Text style={styles.noResults}>Nothing matches “{query}”.</Text>
              ) : (
                results.map((r, idx) => (
                  <Pressable
                    key={r.label}
                    onPress={() => go(r)}
                    onHoverIn={() => setCursor(idx)}
                    style={[styles.resultRow, pointer, idx === cursor && styles.resultRowActive]}
                  >
                    <View style={[styles.resultIcon, idx === cursor && { backgroundColor: colors.surface }]}>
                      <Ionicons name={r.icon} size={18} color={colors.primary} />
                    </View>
                    <Text style={styles.resultText}>{r.label}</Text>
                    {idx === cursor ? <Ionicons name="return-down-back" size={16} color={colors.textSecondary} /> : null}
                  </Pressable>
                ))
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  phoneFrame: { flex: 1, backgroundColor: colors.background, alignItems: "center" },
  phoneColumn: { flex: 1, width: "100%", maxWidth: 640, overflow: "hidden" },
  page: { flex: 1, flexDirection: "row", backgroundColor: colors.background },
  signedOutBody: { flex: 1, alignItems: "center", backgroundColor: colors.background },
  signedOutColumn: { flex: 1, width: "100%", overflow: "hidden" },
  brandPanel: {
    width: "46%",
    maxWidth: 720,
    backgroundColor: colors.heroBg,
    paddingHorizontal: 56,
    paddingVertical: 44,
    justifyContent: "space-between",
  },
  brandTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandPanelName: { fontSize: 20, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.3 },
  brandPanelTag: { fontSize: 13, fontWeight: "700", color: colors.heroMuted, marginLeft: 4 },
  brandHeadline: { fontSize: 40, lineHeight: 46, fontWeight: "800", color: "#FFFFFF", letterSpacing: -1 },
  feature: { flexDirection: "row", alignItems: "center", gap: 14 },
  featureIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  featureText: { flex: 1, fontSize: 15, fontWeight: "600", color: "#E4EBF9", lineHeight: 21 },
  preview: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", padding: 20, gap: 6 },
  previewTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  previewKicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: "#7CE3A5" },
  previewPill: { backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  previewPillText: { fontSize: 12, fontWeight: "800", color: "#FFFFFF" },
  previewTitle: { fontSize: 22, fontWeight: "800", color: "#FFFFFF" },
  previewSub: { fontSize: 13, fontWeight: "600", color: colors.heroMuted },
  previewTrack: { height: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", marginTop: 8, overflow: "hidden" },
  previewFill: { width: "56%", height: 6, borderRadius: 999, backgroundColor: "#7CE3A5" },
  brandFoot: { fontSize: 13, fontWeight: "600", color: colors.heroMuted },
  sidebar: {
    width: 264,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 14,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 8, marginBottom: 16 },
  logo: { width: 36, height: 36, borderRadius: 10 },
  wordmark: { width: 92, height: 20 },
  brandSub: { fontSize: 12, color: colors.textSecondary },
  searchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: 12,
  },
  searchBtnHover: { backgroundColor: colors.surfaceAlt },
  searchText: { flex: 1, fontSize: 14, color: colors.textSecondary },
  kbd: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  groupTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, color: colors.textSecondary, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 6 },
  navItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10 },
  navItemHover: { backgroundColor: colors.surfaceAlt },
  navItemActive: { backgroundColor: colors.badge.blue.bg },
  navText: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  badge: { minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  badgeRed: { backgroundColor: colors.danger },
  badgeOrange: { backgroundColor: colors.accent },
  badgeBlue: { backgroundColor: colors.primary },
  badgeText: { fontSize: 11, fontWeight: "800", color: "#FFFFFF" },
  navTextActive: { color: colors.primary, fontWeight: "800" },
  sos: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.dangerBg,
    marginTop: 8,
  },
  sosText: { fontSize: 14, fontWeight: "800", color: colors.dangerText },
  me: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  meMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.badge.purple.bg, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 12, fontWeight: "800", color: colors.badge.purple.fg },
  meName: { fontSize: 13, fontWeight: "800", color: colors.textPrimary },
  meSub: { fontSize: 11, color: colors.textSecondary },
  logout: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  main: { flex: 1, minWidth: 0 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", paddingTop: 110 },
  palette: {
    width: 620,
    maxWidth: "92%",
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  paletteInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  paletteInput: { flex: 1, fontSize: 16, color: colors.textPrimary, outlineStyle: "none" } as any,
  noResults: { fontSize: 14, color: colors.textSecondary, padding: spacing.md },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 12 },
  resultRowActive: { backgroundColor: colors.badge.blue.bg },
  resultIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  resultText: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.textPrimary },
});
