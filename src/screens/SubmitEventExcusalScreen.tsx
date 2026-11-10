import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, Switch, Modal, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, radius, typography } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import LoadingSpinner from "../components/LoadingSpinner";
import { subscribeToClubs, subscribeToClubEvents, Club, ClubEvent } from "../firebase/clubsService";
import {
  EXCUSAL_CATEGORIES,
  ExcusalCategory,
  EventExcusal,
  RosterSearchResult,
  STEP_TITLE,
  clubsLedBy,
  lookupPastedRegNos,
  searchWholeRoster,
  submitExcusal,
  subscribeToMySubmittedExcusals,
  withdrawExcusal,
} from "../firebase/eventExcusalService";
import { KeyboardAwareFlatList } from "../components/KeyboardAware";
import DateField from "../components/DateField";
import { EmptyState, FieldLabel, PrimaryButton, SelectField, SheetPicker } from "../components/ui";
import ExcusalSteps from "../components/ExcusalSteps";

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const TIMES = Array.from({ length: (19 - 8) * 2 + 1 }, (_, i) => {
  const m = 8 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
function clock12(t?: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
export function excusalWhen(x: { fromDate: string; toDate: string; fullDay?: boolean; fromTime?: string | null; toTime?: string | null }): string {
  const days = x.fromDate === x.toDate ? dateLabel(x.fromDate) : `${dateLabel(x.fromDate)} – ${dateLabel(x.toDate)}`;
  return x.fullDay === false && x.fromTime && x.toTime ? `${days} · ${clock12(x.fromTime)}–${clock12(x.toTime)}` : `${days} · full day`;
}

const STATUS: Record<string, { fg: string; bg: string; label: string }> = {
  pending: { fg: colors.warning, bg: colors.warningBg, label: "Waiting for signatures" },
  approved: { fg: colors.successFg, bg: colors.successBg, label: "Approved" },
  rejected: { fg: colors.danger, bg: colors.dangerBg, label: "Rejected" },
  withdrawn: { fg: colors.textSecondary, bg: colors.surfaceAlt, label: "Withdrawn" },
};

type Picked = RosterSearchResult;
type Sheet = null | "club" | "category" | "event" | "from" | "to";

export default function SubmitEventExcusalScreen() {
  const { profile } = useAuth();
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [mine, setMine] = useState<EventExcusal[]>([]);
  const [sheet, setSheet] = useState<Sheet>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [clubId, setClubId] = useState<string | null>(null);
  const [eventName, setEventName] = useState("");
  const [category, setCategory] = useState<ExcusalCategory | null>(null);
  const [linkedEvent, setLinkedEvent] = useState<ClubEvent | null>(null);
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(todayIso());
  const [fullDay, setFullDay] = useState(true);
  const [fromTime, setFromTime] = useState<string | null>(null);
  const [toTime, setToTime] = useState<string | null>(null);
  const [students, setStudents] = useState<Picked[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Picked[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteNote, setPasteNote] = useState("");
  const [clubEvents, setClubEvents] = useState<ClubEvent[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => subscribeToClubs(setClubs), []);
  useEffect(() => {
    if (!profile?.uid) return;
    return subscribeToMySubmittedExcusals(profile.uid, setMine);
  }, [profile?.uid]);

  const myClubs = useMemo(() => (clubs && profile ? clubsLedBy(clubs, profile.uid, profile.email) : []), [clubs, profile]);
  useEffect(() => {
    if (!clubId && myClubs.length === 1) setClubId(myClubs[0].id);
  }, [myClubs, clubId]);
  const club = myClubs.find((c) => c.id === clubId) ?? null;
  const parent = club?.parentClubId ? clubs?.find((c) => c.id === club.parentClubId) ?? null : club;

  useEffect(() => {
    if (!clubId) return setClubEvents([]);
    return subscribeToClubEvents(clubId, setClubEvents);
  }, [clubId]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length >= 2) searchWholeRoster(q).then(setResults);
      else setResults([]);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const addStudents = (list: Picked[]) => {
    setStudents((prev) => {
      const have = new Set(prev.map((p) => p.regNo));
      return [...prev, ...list.filter((s) => !have.has(s.regNo))];
    });
  };

  const usePaste = async () => {
    const { found, missing } = await lookupPastedRegNos(pasteText);
    if (!found.length && !missing.length) {
      setPasteNote("No enrollment numbers found in that text.");
      return;
    }
    addStudents(found);
    setPasteNote(`${found.length} added${missing.length ? ` · not on the student list: ${missing.join(", ")}` : ""}`);
    if (!missing.length) {
      setPasteOpen(false);
      setPasteText("");
    }
  };

  const pickEvent = (e: ClubEvent | null) => {
    setLinkedEvent(e);
    if (!e) return;
    const d = e.dateTime.toDate();
    setEventName(e.title);
    setFromDate(isoOf(d));
    setToDate(isoOf(d));
    if (e.category && EXCUSAL_CATEGORIES.includes(e.category as ExcusalCategory)) setCategory(e.category as ExcusalCategory);
  };

  const reset = () => {
    setEditingId(null);
    setEventName("");
    setCategory(null);
    setLinkedEvent(null);
    setFromDate(todayIso());
    setToDate(todayIso());
    setFullDay(true);
    setFromTime(null);
    setToTime(null);
    setStudents([]);
  };

  const editAgain = (x: EventExcusal) => {
    setEditingId(x.id);
    setClubId(x.clubId ?? null);
    setEventName(x.eventName);
    setCategory((x.category as ExcusalCategory) ?? null);
    setFromDate(x.fromDate);
    setToDate(x.toDate);
    setFullDay(x.fullDay !== false);
    setFromTime(x.fromTime ?? null);
    setToTime(x.toTime ?? null);
    setStudents((x.students ?? []).map((s) => ({ regNo: s.regNo, name: s.name, branch: s.branch, section: s.section })));
  };

  const submit = async () => {
    if (!club) return Alert.alert("Pick your club");
    if (eventName.trim().length < 3) return Alert.alert("Event name", "Enter the event name.");
    if (!category) return Alert.alert("Category", "Pick a category.");
    if (!fullDay && (!fromTime || !toTime || toTime <= fromTime)) return Alert.alert("Time", "Pick a start and end time, or switch on Full day.");
    if (!students.length) return Alert.alert("Students", "Add the students taking part.");
    setSubmitting(true);
    try {
      const res = await submitExcusal({
        excusalId: editingId ?? undefined,
        clubId: club.id,
        eventName: eventName.trim(),
        category,
        fromDate,
        toDate,
        fullDay,
        fromTime: fullDay ? null : fromTime,
        toTime: fullDay ? null : toTime,
        students: students.map((s) => s.regNo),
        linkedEventId: linkedEvent?.id ?? null,
      });
      reset();
      Alert.alert(
        "Sent",
        `Sent to the faculty in-charge of ${parent?.name ?? club.name}. You'll get a notification at each signature.` +
          (res.timedClasses === 0 ? "\n\nNote: no timetabled classes fall inside that time, so no class will be excused. Withdraw and pick Full day if that's wrong." : ""),
      );
    } catch (e: any) {
      Alert.alert("Couldn't send", e?.message ?? "Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = (x: EventExcusal) =>
    Alert.alert("Withdraw this request?", "Signers won't see it any more. You can edit and send it again later.", [
      { text: "Keep it", style: "cancel" },
      { text: "Withdraw", style: "destructive", onPress: () => withdrawExcusal(x.id).catch((e) => Alert.alert("Couldn't withdraw", e.message)) },
    ]);

  if (clubs === null) return <LoadingSpinner style={{ flex: 1, backgroundColor: colors.background }} />;

  if (myClubs.length === 0) {
    return (
      <View style={styles.page}>
        <EmptyState
          icon="ribbon-outline"
          title="Only club leads send event excusals"
          hint="If you took part in an event, ask your club lead to add you. Once the FIC, Dean of Student Welfare and Dean of Academics sign it, those classes count as attended automatically."
        />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <SafeAreaView style={{ flex: 1 }} edges={[]}>
        <KeyboardAwareFlatList
          data={mine}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <Text style={styles.helper}>
                Signed in order by the club's faculty in-charge, the Dean of Student Welfare and the Dean of Academics. When the last one signs,
                the students' classes in this window count as attended.
              </Text>
              {editingId && (
                <View style={styles.editBanner}>
                  <Ionicons name="create-outline" size={16} color={colors.primary} />
                  <Text style={styles.editText}>Editing a returned request. Sending it starts the signatures again.</Text>
                  <TouchableOpacity onPress={reset} hitSlop={8}>
                    <Text style={styles.link}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}

              <SelectField
                label="Club"
                value={club ? `${club.name}${parent && parent.id !== club.id ? ` · under ${parent.name}` : ""}` : null}
                placeholder="Pick your club"
                icon="people-outline"
                onPress={() => setSheet("club")}
              />
              {club && clubEvents.length > 0 && (
                <SelectField
                  label="Link a club event (optional)"
                  value={linkedEvent ? `${linkedEvent.title} · ${dateLabel(isoOf(linkedEvent.dateTime.toDate()))}` : null}
                  placeholder="Fill details from an event"
                  icon="calendar-outline"
                  onPress={() => setSheet("event")}
                />
              )}
              <FieldLabel>Event name</FieldLabel>
              <TextInput
                style={styles.input}
                value={eventName}
                onChangeText={setEventName}
                placeholder="e.g. Inter-College Sports Meet 2026"
                placeholderTextColor={colors.textSecondary}
              />
              <SelectField label="Category" value={category} placeholder="Pick category" icon="pricetag-outline" onPress={() => setSheet("category")} />

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <FieldLabel>From</FieldLabel>
                  <DateField
                    value={fromDate}
                    onChange={(d) => {
                      setFromDate(d);
                      if (toDate < d) setToDate(d);
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FieldLabel>To</FieldLabel>
                  <DateField value={toDate} onChange={setToDate} min={fromDate} />
                </View>
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Full day</Text>
                  <Text style={styles.switchSub}>{fullDay ? "Every class on these days is excused" : "Only classes inside the time below are excused"}</Text>
                </View>
                <Switch value={fullDay} onValueChange={setFullDay} trackColor={{ true: colors.primary, false: colors.border }} />
              </View>
              {!fullDay && (
                <View style={styles.row2}>
                  <View style={{ flex: 1 }}>
                    <SelectField label="Start time" value={fromTime ? clock12(fromTime) : null} placeholder="Start" icon="time-outline" onPress={() => setSheet("from")} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <SelectField label="End time" value={toTime ? clock12(toTime) : null} placeholder="End" icon="time-outline" onPress={() => setSheet("to")} />
                  </View>
                </View>
              )}

              <View style={styles.studentHead}>
                <FieldLabel>Students ({students.length})</FieldLabel>
                <TouchableOpacity onPress={() => setPasteOpen(true)} style={styles.pasteBtn}>
                  <Ionicons name="clipboard-outline" size={15} color={colors.primary} />
                  <Text style={styles.link}>Paste a list</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                value={q}
                onChangeText={setQ}
                placeholder="Search by name or enrollment number"
                placeholderTextColor={colors.textSecondary}
                autoCorrect={false}
              />
              {results.map((s) => (
                <TouchableOpacity
                  key={s.regNo}
                  style={styles.resultRow}
                  onPress={() => {
                    addStudents([s]);
                    setQ("");
                    setResults([]);
                  }}
                >
                  <Text style={styles.resultText}>
                    {s.name} · {s.regNo}
                  </Text>
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
              ))}
              {students.length > 0 && (
                <View style={styles.chips}>
                  {students.map((s) => (
                    <View key={s.regNo} style={styles.chip}>
                      <Text style={styles.chipText} numberOfLines={1}>
                        {s.name} · {s.regNo.slice(-3)}
                      </Text>
                      <TouchableOpacity onPress={() => setStudents((p) => p.filter((x) => x.regNo !== s.regNo))} hitSlop={6}>
                        <Ionicons name="close" size={14} color={colors.onPrimary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <PrimaryButton
                label={editingId ? "Send again for signatures" : "Send for signatures"}
                icon="send-outline"
                onPress={submit}
                loading={submitting}
                style={{ marginTop: spacing.md }}
              />
              {mine.length > 0 && <Text style={styles.sectionTitle}>Your requests</Text>}
            </View>
          }
          renderItem={({ item: x }) => {
            const st = STATUS[x.status] ?? STATUS.pending;
            const isV2 = x.flow === 2;
            const waitingOn = isV2 && x.stage && x.stage in STEP_TITLE ? STEP_TITLE[x.stage as keyof typeof STEP_TITLE] : null;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {x.eventName}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  {excusalWhen(x)} · {x.studentEnrollmentNumbers.length} students
                  {x.clubName ? ` · ${x.clubName}` : ""}
                </Text>
                {isV2 ? <ExcusalSteps x={x} /> : <Text style={styles.meta}>Sent to {x.facultyCoordinatorName}</Text>}
                {waitingOn && <Text style={styles.meta}>Now with: {waitingOn} ({x.approvers?.[x.stage as "fic"]?.name})</Text>}
                {!!(x.rejectedReason || x.facultyRemark) && x.status !== "approved" && <Text style={styles.reason}>“{x.rejectedReason || x.facultyRemark}”</Text>}
                {isV2 && x.status === "pending" && (
                  <TouchableOpacity onPress={() => withdraw(x)} style={styles.actionBtn}>
                    <Text style={[styles.link, { color: colors.danger }]}>Withdraw</Text>
                  </TouchableOpacity>
                )}
                {isV2 && (x.status === "rejected" || x.status === "withdrawn") && (
                  <TouchableOpacity onPress={() => editAgain(x)} style={styles.actionBtn}>
                    <Text style={styles.link}>Edit & send again</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      </SafeAreaView>

      <SheetPicker
        visible={sheet === "club"}
        title="Your club"
        items={myClubs}
        keyOf={(c) => c.id}
        labelOf={(c) => c.name}
        sublabelOf={(c) => (c.parentClubId ? `Under ${clubs.find((p) => p.id === c.parentClubId)?.name ?? "parent club"}` : undefined)}
        selectedKey={clubId}
        onPick={(c) => {
          setClubId(c.id);
          setLinkedEvent(null);
        }}
        onClose={() => setSheet(null)}
      />
      <SheetPicker
        visible={sheet === "category"}
        title="Category"
        items={[...EXCUSAL_CATEGORIES]}
        keyOf={(c) => c}
        labelOf={(c) => c}
        selectedKey={category}
        onPick={setCategory}
        onClose={() => setSheet(null)}
      />
      <SheetPicker
        visible={sheet === "event"}
        title="Club event"
        items={[null, ...clubEvents] as (ClubEvent | null)[]}
        keyOf={(e) => e?.id ?? "__none"}
        labelOf={(e) => (e ? e.title : "Don't link an event")}
        sublabelOf={(e) => (e ? dateLabel(isoOf(e.dateTime.toDate())) : undefined)}
        selectedKey={linkedEvent?.id ?? "__none"}
        onPick={pickEvent}
        onClose={() => setSheet(null)}
      />
      <SheetPicker
        visible={sheet === "from"}
        title="Start time"
        items={TIMES}
        keyOf={(t) => t}
        labelOf={clock12}
        selectedKey={fromTime}
        onPick={(t) => {
          setFromTime(t);
          if (toTime && toTime <= t) setToTime(null);
        }}
        onClose={() => setSheet(null)}
      />
      <SheetPicker
        visible={sheet === "to"}
        title="End time"
        items={TIMES.filter((t) => !fromTime || t > fromTime)}
        keyOf={(t) => t}
        labelOf={clock12}
        selectedKey={toTime}
        onPick={setToTime}
        onClose={() => setSheet(null)}
      />

      <Modal visible={pasteOpen} transparent animationType="slide" onRequestClose={() => setPasteOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPasteOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>Paste enrollment numbers</Text>
            <Text style={styles.switchSub}>Copy them from a sheet or message. Commas, spaces or one per line all work.</Text>
            <TextInput
              style={[styles.input, { minHeight: 140, textAlignVertical: "top", marginTop: spacing.sm }]}
              multiline
              value={pasteText}
              onChangeText={(t) => {
                setPasteText(t);
                setPasteNote("");
              }}
              placeholder={"UG25CSE101\nUG25CSE114, UG24ECE020"}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {!!pasteNote && <Text style={styles.pasteNote}>{pasteNote}</Text>}
            <View style={styles.row2}>
              <PrimaryButton label="Close" tone="secondary" onPress={() => setPasteOpen(false)} style={{ flex: 1 }} />
              <PrimaryButton label="Add students" onPress={usePaste} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  helper: { ...typography.caption, color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.md },
  editBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.tile.blue.bg, borderRadius: radius.md, padding: 10, marginBottom: spacing.md },
  editText: { flex: 1, fontSize: 12.5, color: colors.textPrimary, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  row2: { flexDirection: "row", gap: spacing.sm },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, marginVertical: spacing.sm },
  switchTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  switchSub: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  studentHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  pasteBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  link: { color: colors.primary, fontWeight: "700", fontSize: 13.5 },
  resultRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, marginTop: -6, marginBottom: 8 },
  resultText: { fontSize: 14, color: colors.textPrimary, flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: "100%" },
  chipText: { color: colors.onPrimary, fontSize: 12.5, fontWeight: "700", flexShrink: 1 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11.5, fontWeight: "800" },
  meta: { fontSize: 12.5, color: colors.textSecondary, marginTop: 4 },
  reason: { fontSize: 13, color: colors.danger, marginTop: 6, fontStyle: "italic" },
  actionBtn: { alignSelf: "flex-start", marginTop: 10 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: 6 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  pasteNote: { fontSize: 13, color: colors.textPrimary, fontWeight: "600", marginBottom: 6 },
});
