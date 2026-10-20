import {onDocumentWritten, onDocumentUpdated} from "firebase-functions/v2/firestore";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {isNoClassDay} from "./holidays";
import {loadHolidayOverrides} from "./holidayOverrides";
import {lookupFacultyInitials} from "./facultyLegend";
import {
  buildFacultyResolver,
  computeTeacherTasks,
  datesInRange,
  excusedSessionKeys,
  semesterOn,
  TeacherSubject,
  TTDay,
} from "./medicalLeaveTeachers";

// MEDICAL LEAVE CHAIN
//
//   student submits ──► doctor ──► HOD (student's branch) ──► teachers ──► done
//                         │            │
//                         └────────────┴──► rejected
//
// The app/portal move `stage` forward for the doctor and HOD steps
// (firestore.rules checks each person can only act on their own step).
// This function does everything else:
//   • pushes whoever's turn it now is, and keeps the student informed;
//   • after HOD approval, works out which teachers' classes the student
//     missed (timetable × leave dates) and creates one teacherAcks doc
//     per teacher for them to confirm;
//   • when the last teacher confirms, marks the leave "done".

type Decision = {decision: "approved" | "rejected"; remark?: string | null; by: string; byName?: string};

type MedicalLeave = {
  type: "medical" | "casual";
  stage?: "doctor" | "hod" | "teachers" | "done" | "rejected";
  studentUid: string;
  studentName: string;
  studentEnrollmentNumber?: string;
  doctorEmail: string;
  doctorName?: string;
  hodEmail: string;
  hodName?: string;
  fromDate: string;
  toDate: string;
  doctorDecision?: Decision;
  hodDecision?: Decision;
  teachersTotal?: number;
};

type AckDoc = {
  email: string;
  status: "pending" | "confirmed";
  subjects: TeacherSubject[];
};

async function tokensForUid(db: FirebaseFirestore.Firestore, uid: string): Promise<string[]> {
  const snap = await db.collection("users").doc(uid).get();
  const t = (snap.data() as {expoPushToken?: string} | undefined)?.expoPushToken;
  return t ? [t] : [];
}

// Faculty are addressed by email (they may not even have signed in yet),
// so their push tokens are looked up by the email on their profile.
async function tokensForEmails(db: FirebaseFirestore.Firestore, emails: string[]): Promise<string[]> {
  const tokens: string[] = [];
  const unique = Array.from(new Set(emails.map((e) => e.toLowerCase()).filter(Boolean)));
  for (let i = 0; i < unique.length; i += 30) {
    const snap = await db.collection("users").where("email", "in", unique.slice(i, i + 30)).get();
    snap.forEach((d) => {
      const t = (d.data() as {expoPushToken?: string}).expoPushToken;
      if (t) tokens.push(t);
    });
  }
  return tokens;
}

function range(l: MedicalLeave): string {
  return l.fromDate === l.toDate ? l.fromDate : `${l.fromDate} → ${l.toDate}`;
}

// Step 3 setup: who has to confirm, for which classes.
async function createTeacherAcks(
  db: FirebaseFirestore.Firestore,
  leaveRef: FirebaseFirestore.DocumentReference,
  leave: MedicalLeave,
): Promise<{teacherEmails: string[]; note: string | null}> {
  const studentSnap = await db.collection("users").doc(leave.studentUid).get();
  const student = studentSnap.data() as {branch?: string; section?: string; admissionYear?: number} | undefined;
  if (!student?.branch || !student.admissionYear) {
    return {teacherEmails: [], note: "Student profile has no branch/batch, so their timetable couldn't be found."};
  }

  // Same doc-id scheme as timetableService.ts (MNC shares CSE's timetable).
  const ttBranch = student.branch.toUpperCase() === "MNC" ? "CSE" : student.branch;
  const semester = semesterOn(student.admissionYear, leave.fromDate);
  let ttSnap = await db.collection("timetable").doc(`${ttBranch}-${semester}-${student.section ?? ""}`).get();
  if (!ttSnap.exists) {
    const q = await db.collection("timetable")
      .where("branch", "==", ttBranch)
      .where("semester", "==", semester)
      .where("section", "==", student.section ?? "")
      .limit(1)
      .get();
    if (!q.empty) ttSnap = q.docs[0] as unknown as FirebaseFirestore.DocumentSnapshot;
  }
  if (!ttSnap.exists) {
    return {
      teacherEmails: [],
      note: `No timetable found for ${ttBranch} Sem ${semester} ${student.section ?? ""} — teachers couldn't be worked out automatically.`,
    };
  }
  const days = ((ttSnap.data() as {days?: TTDay[]}).days ?? []);

  const overrides = await loadHolidayOverrides(db);
  const dates = datesInRange(leave.fromDate, leave.toDate);
  const allowSnap = await db.collection("allowlist").where("role", "==", "faculty").get();
  const resolver = buildFacultyResolver(
    allowSnap.docs.map((d) => {
      const a = d.data() as {name?: string; shortForm?: string};
      return {email: d.id, name: a.name, shortForm: a.shortForm};
    }),
    lookupFacultyInitials,
  );
  const {tasks, unmatched} = computeTeacherTasks(
    days,
    dates,
    resolver,
    (d) => isNoClassDay(d) || overrides.has(d),
  );

  // Idempotent: a retried run never resets a teacher who already confirmed.
  const existing = await leaveRef.collection("teacherAcks").get();
  const have = new Set(existing.docs.map((d) => d.id));
  const batch = db.batch();
  for (const t of tasks) {
    if (have.has(t.email)) continue;
    batch.set(leaveRef.collection("teacherAcks").doc(t.email), {
      email: t.email,
      name: t.name,
      leaveId: leaveRef.id,
      studentUid: leave.studentUid,
      studentName: leave.studentName,
      studentEnrollmentNumber: leave.studentEnrollmentNumber ?? null,
      fromDate: leave.fromDate,
      toDate: leave.toDate,
      subjects: t.subjects,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      confirmedAt: null,
      confirmedBy: null,
      remark: null,
    });
  }
  const teacherEmails = tasks.map((t) => t.email);
  if (existing.empty) {
    batch.update(leaveRef, {
      teacherEmails,
      teachersTotal: tasks.length,
      teachersConfirmed: 0,
      excusedSessions: [],
      unmatchedFaculty: unmatched,
      ...(tasks.length === 0 ? {stage: "done", teacherNote: "No classes fell within these dates."} : {}),
    });
  } else {
    // A retried run: acks already exist and some may be confirmed — never
    // reset the progress counters (the confirm trigger owns those).
    batch.update(leaveRef, {
      teacherEmails: Array.from(new Set([...existing.docs.map((d) => d.id), ...teacherEmails])),
      teachersTotal: new Set([...existing.docs.map((d) => d.id), ...teacherEmails]).size,
      unmatchedFaculty: unmatched,
    });
  }
  await batch.commit();

  const note = unmatched.length > 0 ?
    `Not matched to a faculty account (no confirmation asked): ${unmatched.join(", ")}` :
    null;
  return {teacherEmails, note};
}

export const medicalLeaveWorkflow = onDocumentWritten("leaveApplications/{leaveId}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const leave = after.data() as MedicalLeave;
  if (leave.type !== "medical" || !leave.stage) return;
  const before = event.data?.before;
  const prevStage = before?.exists ? (before.data() as MedicalLeave).stage : undefined;
  if (prevStage === leave.stage) return; // not a stage change

  const db = getFirestore();
  const who = `${leave.studentName}${leave.studentEnrollmentNumber ? ` (${leave.studentEnrollmentNumber})` : ""}`;
  const tag = "medicalLeaveWorkflow";

  switch (leave.stage) {
  case "doctor": {
    await sendExpoPush(
      await tokensForEmails(db, [leave.doctorEmail]),
      "New medical leave to review",
      `${who} · ${range(leave)}. Report attached — open Leave Requests.`,
      tag,
    );
    return;
  }
  case "hod": {
    await Promise.all([
      sendExpoPush(
        await tokensForEmails(db, [leave.hodEmail]),
        "Medical leave needs your approval",
        `${who} · ${range(leave)} · approved by ${leave.doctorDecision?.byName ?? leave.doctorName ?? "the doctor"}.`,
        tag,
      ),
      sendExpoPush(
        await tokensForUid(db, leave.studentUid),
        "Doctor approved your medical leave",
        `Now waiting for ${leave.hodName ?? "your HOD"}.`,
        tag,
      ),
    ]);
    return;
  }
  case "teachers": {
    const {teacherEmails} = await createTeacherAcks(db, after.ref, leave);
    // With no teachers, createTeacherAcks already moved the leave to
    // "done", whose own push tells the student — don't send two.
    if (teacherEmails.length === 0) return;
    await Promise.all([
      sendExpoPush(
        await tokensForUid(db, leave.studentUid),
        "HOD approved your medical leave",
        `Your ${teacherEmails.length} teacher(s) are being asked to excuse the classes you missed.`,
        tag,
      ),
      sendExpoPush(
        await tokensForEmails(db, teacherEmails),
        "Excuse missed classes",
        `${who} was on approved medical leave ${range(leave)}. Confirm the classes of yours they missed.`,
        tag,
      ),
    ]);
    return;
  }
  case "rejected": {
    const d = leave.hodDecision?.decision === "rejected" ? leave.hodDecision : leave.doctorDecision;
    const by = d?.byName ?? (d === leave.hodDecision ? leave.hodName : leave.doctorName) ?? "Your approver";
    await sendExpoPush(
      await tokensForUid(db, leave.studentUid),
      "Medical leave rejected",
      d?.remark ? `${by}: "${d.remark}"` : `${by} rejected your medical leave (${range(leave)}).`,
      tag,
    );
    return;
  }
  case "done": {
    await sendExpoPush(
      await tokensForUid(db, leave.studentUid),
      "Medical leave complete",
      (leave.teachersTotal ?? 0) > 0 ?
        "All your teachers confirmed — the classes you missed are excused." :
        `Approved. No classes of yours fell within ${range(leave)}.`,
      tag,
    );
    return;
  }
  }
});

// A teacher confirmed: recount from scratch (safe to retry), record the
// excused sessions, and close the leave when everyone has confirmed.
export const medicalLeaveTeacherConfirmed = onDocumentUpdated(
  "leaveApplications/{leaveId}/teacherAcks/{teacherEmail}",
  async (event) => {
    const before = event.data?.before.data() as AckDoc | undefined;
    const after = event.data?.after.data() as AckDoc | undefined;
    if (!after || before?.status === after.status || after.status !== "confirmed") return;

    const db = getFirestore();
    const leaveRef = db.collection("leaveApplications").doc(event.params.leaveId);
    await db.runTransaction(async (tx) => {
      const leaveSnap = await tx.get(leaveRef);
      if (!leaveSnap.exists) return;
      const leave = leaveSnap.data() as MedicalLeave;
      const acks = await tx.get(leaveRef.collection("teacherAcks"));
      const confirmed = acks.docs.map((d) => d.data() as AckDoc).filter((a) => a.status === "confirmed");
      const excused = Array.from(new Set(confirmed.flatMap((a) => excusedSessionKeys(a.subjects ?? [])))).sort();
      const total = leave.teachersTotal ?? acks.size;
      tx.update(leaveRef, {
        teachersConfirmed: confirmed.length,
        excusedSessions: excused,
        ...(leave.stage === "teachers" && confirmed.length >= total ? {stage: "done"} : {}),
      });
    });
  },
);
