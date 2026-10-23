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

type Decision = {decision: "approved" | "rejected"; remark?: string | null; by: string; byName?: string};

type MedicalLeave = {
  type: "medical" | "casual";
  stage?: "doctor" | "dr" | "dean" | "hod" | "teachers" | "done" | "rejected";
  studentUid: string;
  studentName: string;
  studentEnrollmentNumber?: string;
  doctorEmail: string;
  doctorName?: string;
  hodEmail: string;
  hodName?: string;
  drEmail?: string;
  drName?: string;
  deanEmail?: string;
  deanName?: string;
  fromDate: string;
  toDate: string;
  doctorDecision?: Decision;
  drDecision?: Decision;
  deanDecision?: Decision;
  hodDecision?: Decision;
  teachersTotal?: number;
  autoExcused?: boolean;
};

type AckDoc = {
  email: string;
  name?: string;
  status: "pending" | "confirmed" | "excused" | "declined";
  subjects: TeacherSubject[];
  declinedSessions?: string[];
  studentUid?: string;
};

async function tokensForUid(db: FirebaseFirestore.Firestore, uid: string): Promise<string[]> {
  const snap = await db.collection("users").doc(uid).get();
  const t = (snap.data() as {expoPushToken?: string} | undefined)?.expoPushToken;
  return t ? [t] : [];
}

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

async function createTeacherAcks(
  db: FirebaseFirestore.Firestore,
  leaveRef: FirebaseFirestore.DocumentReference,
  leave: MedicalLeave,
): Promise<{teacherEmails: string[]; note: string | null; fallback?: boolean}> {
  const studentSnap = await db.collection("users").doc(leave.studentUid).get();
  const student = studentSnap.data() as {branch?: string; section?: string; admissionYear?: number} | undefined;
  if (!student?.branch || !student.admissionYear) {
    return {teacherEmails: [], note: "Student profile has no branch/batch, so their timetable couldn't be found.", fallback: true};
  }

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
      fallback: true,
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
      status: "excused",
      declinedSessions: [],
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
      teachersConfirmed: tasks.length,
      excusedSessions: Array.from(new Set(tasks.flatMap((t) => excusedSessionKeys(t.subjects)))).sort(),
      unmatchedFaculty: unmatched,
      autoExcused: true,
      stage: "done",
      ...(tasks.length === 0 ? {teacherNote: "Approved. No classes fell within these dates."} : {}),
    });
  } else {

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
  if (prevStage === leave.stage) return;

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
  case "dr":
  case "dean":
  case "hod": {
    const target = leave.stage === "dr" ?
      {email: leave.drEmail ?? "", name: leave.drName || "the Deputy Registrar"} :
      leave.stage === "dean" ?
        {email: leave.deanEmail ?? "", name: leave.deanName || "the Dean"} :
        {email: leave.hodEmail, name: leave.hodName ?? "your HOD"};
    const last = prevStage === "dean" ?
      {d: leave.deanDecision, label: "Dean"} :
      prevStage === "dr" ?
        {d: leave.drDecision, label: "Deputy Registrar"} :
        {d: leave.doctorDecision, label: "Doctor"};
    await Promise.all([
      sendExpoPush(
        await tokensForEmails(db, [target.email]),
        "Medical leave needs your approval",
        `${who} · ${range(leave)} · approved by ${last.d?.byName ?? last.label}.`,
        tag,
      ),
      sendExpoPush(
        await tokensForUid(db, leave.studentUid),
        `${last.label} approved your medical leave`,
        `Now waiting for ${target.name}.`,
        tag,
      ),
    ]);
    return;
  }
  case "teachers": {
    const {teacherEmails, fallback} = await createTeacherAcks(db, after.ref, leave);
    if (fallback) {
      await after.ref.update({
        stage: "done",
        autoExcused: true,
        excuseAllDates: true,
        teacherNote: "Approved. Every class in these dates counts as present.",
      });
    }

    await Promise.all([
      sendExpoPush(
        await tokensForUid(db, leave.studentUid),
        "Medical leave approved",
        teacherEmails.length > 0 ?
          `Your classes from ${range(leave)} now count as present.` :
          `Approved. No classes of yours fell within ${range(leave)}.`,
        tag,
      ),
      teacherEmails.length > 0 ?
        sendExpoPush(
          await tokensForEmails(db, teacherEmails),
          "Classes excused for medical leave",
          `${who} was on approved medical leave ${range(leave)}. Their classes with you count as present. You can change this in Leave Requests.`,
          tag,
        ) :
        Promise.resolve(),
    ]);
    return;
  }
  case "rejected": {
    const d = [leave.hodDecision, leave.deanDecision, leave.drDecision, leave.doctorDecision]
      .find((x) => x?.decision === "rejected");
    const by = d?.byName ?? "Your approver";
    await sendExpoPush(
      await tokensForUid(db, leave.studentUid),
      "Medical leave rejected",
      d?.remark ? `${by}: "${d.remark}"` : `${by} rejected your medical leave (${range(leave)}).`,
      tag,
    );
    return;
  }
  case "done": {
    if (leave.autoExcused || prevStage === "teachers") return;
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

export const medicalLeaveTeacherConfirmed = onDocumentUpdated(
  "leaveApplications/{leaveId}/teacherAcks/{teacherEmail}",
  async (event) => {
    const before = event.data?.before.data() as AckDoc | undefined;
    const after = event.data?.after.data() as AckDoc | undefined;
    if (!after) return;
    const sameDeclined = JSON.stringify(before?.declinedSessions ?? []) === JSON.stringify(after.declinedSessions ?? []);
    if (before?.status === after.status && sameDeclined) return;

    const db = getFirestore();
    const leaveRef = db.collection("leaveApplications").doc(event.params.leaveId);
    let studentUid: string | null = null;
    await db.runTransaction(async (tx) => {
      const leaveSnap = await tx.get(leaveRef);
      if (!leaveSnap.exists) return;
      const leave = leaveSnap.data() as MedicalLeave;
      studentUid = leave.studentUid;
      const acks = await tx.get(leaveRef.collection("teacherAcks"));
      const all = acks.docs.map((d) => d.data() as AckDoc);
      const excused = new Set<string>();
      for (const a of all) {
        if (a.status !== "confirmed" && a.status !== "excused") continue;
        const declined = new Set(a.declinedSessions ?? []);
        for (const k of excusedSessionKeys(a.subjects ?? [])) if (!declined.has(k)) excused.add(k);
      }
      const decided = all.filter((a) => a.status !== "pending").length;
      const total = leave.teachersTotal ?? acks.size;
      tx.update(leaveRef, {
        teachersConfirmed: decided,
        excusedSessions: Array.from(excused).sort(),
        ...(leave.stage === "teachers" && decided >= total ? {stage: "done"} : {}),
      });
    });

    const newlyDeclined = after.status === "declined" ?
      excusedSessionKeys(after.subjects ?? []).length :
      (after.declinedSessions ?? []).filter((k) => !(before?.declinedSessions ?? []).includes(k)).length;
    if (studentUid && newlyDeclined > 0 && before?.status !== "pending") {
      await sendExpoPush(
        await tokensForUid(db, studentUid),
        "A class wasn't excused",
        `${after.name ?? "A teacher"} chose not to excuse ${newlyDeclined} of your classes from your medical leave.`,
        "medicalLeaveTeacherConfirmed",
      );
    }
  },
);
