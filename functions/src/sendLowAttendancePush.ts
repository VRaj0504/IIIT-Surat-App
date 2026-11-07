import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {tokensByEnrollment} from "./audience";

const TARGET = 75;

type Excused = {ranges: {from: string; to: string}[]; sessions: Set<string>};

// Approved event excusals and medical leave, so the push matches what the student sees in the app.
async function excusalsFor(reg: string): Promise<Excused> {
  const db = getFirestore();
  const out: Excused = {ranges: [], sessions: new Set()};
  const [events, medical] = await Promise.all([
    db.collection("eventExcusals").where("studentEnrollmentNumbers", "array-contains", reg).where("status", "==", "approved").get(),
    db.collection("medicalExcusals").where("enrollmentNumber", "==", reg).get(),
  ]);
  events.docs.forEach((d) => {
    const x = d.data() as {
      flow?: number; fullDay?: boolean; fromDate?: string; toDate?: string;
      students?: {regNo: string; classKey: string | null}[]; sessionsByClass?: Record<string, string[]> | null;
    };
    if (!x.fromDate || !x.toDate) return;
    if (x.flow === 2 && x.fullDay === false) {
      const key = x.students?.find((s) => s.regNo === reg)?.classKey;
      ((key && x.sessionsByClass?.[key]) || []).forEach((k) => out.sessions.add(k));
    } else {
      out.ranges.push({from: x.fromDate, to: x.toDate});
    }
  });
  medical.docs.forEach((d) => {
    const x = d.data() as {fromDate?: string | null; toDate?: string | null; sessions?: string[]; allDates?: boolean};
    (x.sessions ?? []).forEach((k) => out.sessions.add(k));
    if (x.allDates && x.fromDate && x.toDate) out.ranges.push({from: x.fromDate, to: x.toDate});
  });
  return out;
}

type Session = {
  date?: string;
  branch?: string;
  admissionYear?: number;
  section?: string | null;
  subjectCode?: string;
  subjectName?: string;
  specialization?: string | null;
  absentEnrollmentNumbers?: string[];
  excusedEnrollmentNumbers?: string[];
  onlyEnrollmentNumbers?: string[];
  hours?: number;
};

function tally(sessions: Session[], reg: string, ex?: Excused): {present: number; total: number} {
  let present = 0;
  let total = 0;
  for (const s of sessions) {
    if (s.onlyEnrollmentNumbers?.length && !s.onlyEnrollmentNumbers.includes(reg)) continue;
    const w = Math.max(1, Math.round(s.hours ?? 1));
    total += w;
    const absent = (s.absentEnrollmentNumbers ?? []).includes(reg);
    const d = s.date ?? "";
    const excused =
      (s.excusedEnrollmentNumbers ?? []).includes(reg) ||
      (!!ex && !!d && (ex.ranges.some((r) => d >= r.from && d <= r.to) || ex.sessions.has(`${s.subjectCode}|${d}`) || ex.sessions.has(`*|${d}`)));
    if (!absent || excused) present += w;
  }
  return {present, total};
}

const pct = (t: {present: number; total: number}) => (t.total ? (t.present / t.total) * 100 : 100);

export const sendLowAttendancePush = onDocumentWritten(
  "attendanceSessions/{sessionId}",
  async (event) => {
    const after = event.data?.after?.exists ? (event.data.after.data() as Session) : null;
    if (!after?.branch || !after.admissionYear || !after.subjectCode) return;
    const before = event.data?.before?.exists ? (event.data.before.data() as Session) : null;

    const excusedNow = new Set(after.excusedEnrollmentNumbers ?? []);
    const wasAbsent = new Set(before?.absentEnrollmentNumbers ?? []);
    const newlyAbsent = (after.absentEnrollmentNumbers ?? []).filter((r) => !excusedNow.has(r) && !wasAbsent.has(r));
    // Absent today but on approved leave or event duty for this date: no warning.
    if (newlyAbsent.length === 0) return;

    const snap = await getFirestore()
      .collection("attendanceSessions")
      .where("branch", "==", after.branch)
      .where("admissionYear", "==", after.admissionYear)
      .where("subjectCode", "==", after.subjectCode)
      .get();
    const sameClass = (s: Session) =>
      (s.section || null) === (after.section || null) &&
      (!after.specialization || !s.specialization || s.specialization === after.specialization);
    const others = snap.docs.filter((d) => d.id !== event.params.sessionId).map((d) => d.data() as Session).filter(sameClass);
    const nowAll = [...others, after];
    const thenAll = before ? [...others, before] : others;
    const subject = after.subjectName || after.subjectCode;

    for (const reg of newlyAbsent) {
      const ex = await excusalsFor(reg).catch(() => undefined);
      const now = tally(nowAll, reg, ex);
      const then = tally(thenAll, reg, ex);
      const p = pct(now);
      if (p >= TARGET || pct(then) < TARGET) continue;
      const t = TARGET / 100;
      const need = Math.ceil((t * now.total - now.present) / (1 - t) - 1e-9);
      const tokens = await tokensByEnrollment(reg, "attendanceAlerts");
      await sendExpoPush(
        tokens,
        `${subject} is now ${Math.round(p * 10) / 10}%`,
        `You've dropped below ${TARGET}%. Attend the next ${need} class${need === 1 ? "" : "es"} to get back.`,
        "sendLowAttendancePush",
        {screen: "MyAttendance"},
      );
    }
  },
);
