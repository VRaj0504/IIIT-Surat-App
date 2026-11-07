import {onCall, HttpsError, CallableRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {currentSemester, sameSection, tokensOf, type UserDoc} from "./audience";

// Event excusal: a club lead sends the list -> FIC of the parent club signs -> Dean of Student Welfare signs
// -> Academic Dean signs -> approved. Once approved, those students' classes in the window count as attended.

const REGION = "asia-south1";
const COLLECTION = "eventExcusals";
const MAX_STUDENTS = 300;
const MAX_DAYS = 15;

export const EXCUSAL_CATEGORIES = ["Sports", "Cultural", "Technical", "Fest", "Competition", "Other"] as const;
type Stage = "fic" | "dsw" | "dean" | "approved" | "rejected" | "withdrawn";
const STEPS: ("fic" | "dsw" | "dean")[] = ["fic", "dsw", "dean"];
const STEP_TITLE: Record<"fic" | "dsw" | "dean", string> = {
  fic: "Faculty in-charge",
  dsw: "Dean, Student Welfare",
  dean: "Dean, Academics",
};

type Person = {name: string; email: string};
type Cfg = {dsw?: Person; dean?: Person; fic?: Record<string, Person>};
type Caller = {uid: string; email: string; name: string; admin: boolean};
type Sig = {w: number; h: number; paths: string[]; png?: string};
type Student = {regNo: string; name: string; branch: string; section: string | null; admissionYear: number | null; classKey: string | null};

const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();
const txt = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const squash = (s: unknown) => String(s ?? "").toUpperCase().replace(/[\s_\-.]+/g, "");

async function caller(req: CallableRequest): Promise<Caller> {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const snap = await getFirestore().collection("users").doc(req.auth.uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "Your account isn't set up yet.");
  const u = snap.data() as {name?: string; email?: string; role?: string; isAdmin?: boolean};
  const email = norm(u.email ?? req.auth.token.email);
  return {uid: req.auth.uid, email, name: u.name || email.split("@")[0], admin: u.role === "admin" || u.isAdmin === true};
}

async function loadCfg(): Promise<Cfg> {
  const c = ((await getFirestore().collection("config").doc("eventExcusal").get()).data() ?? {}) as Cfg;
  return c;
}

function checkSignature(v: unknown): Sig {
  const s = v as Sig | undefined;
  if (!s || typeof s !== "object") throw new HttpsError("invalid-argument", "Add your signature.");
  const w = Number(s.w);
  const h = Number(s.h);
  if (!(w > 0 && w < 4000 && h > 0 && h < 4000)) throw new HttpsError("invalid-argument", "Signature size is invalid.");
  if (typeof s.png === "string" && s.png) {
    if (s.png.length > 130000 || !/^[A-Za-z0-9+/=]+$/.test(s.png)) throw new HttpsError("invalid-argument", "Signature image is too large.");
    return {w: Math.round(w), h: Math.round(h), paths: [], png: s.png};
  }
  const paths = Array.isArray(s.paths) ? s.paths.map(String).filter((p) => p.length > 0) : [];
  if (paths.length === 0 || paths.length > 200) throw new HttpsError("invalid-argument", "Draw your signature first.");
  const total = paths.reduce((n, p) => n + p.length, 0);
  if (total > 40000 || !paths.every((p) => /^[MLQC0-9 .,-]+$/.test(p))) throw new HttpsError("invalid-argument", "Signature data is invalid. Clear it and sign again.");
  return {w: Math.round(w), h: Math.round(h), paths};
}

function toMinutes(time: string): number {
  const m = String(time ?? "").trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*([AaPp])?\.?\s*[Mm]?\.?$/);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3]?.toUpperCase();
  if (mer === "P" && h < 12) h += 12;
  else if (mer === "A" && h === 12) h = 0;
  else if (!mer && h >= 1 && h <= 7) h += 12;
  return h * 60 + min;
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const [y, m, d] = from.split("-").map(Number);
  for (let t = Date.UTC(y, m - 1, d); ; t += 86400000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (iso > to) break;
    out.push(iso);
  }
  return out;
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

type Timetable = {branch: string; semester: number; section: string; days?: {day: string; slots?: {startTime: string; endTime: string; subjectCode: string}[]}[]};

/** For a timed excusal: the exact classes (subjectCode|date) each class group has inside the window. */
async function sessionsFor(students: Student[], from: string, to: string, fromTime: string, toTime: string): Promise<Record<string, string[]>> {
  const tts = (await getFirestore().collection("timetable").get()).docs.map((d) => d.data() as Timetable);
  const a = toMinutes(fromTime);
  const b = toMinutes(toTime);
  const out: Record<string, string[]> = {};
  const dates = datesBetween(from, to);
  for (const s of students) {
    if (!s.classKey || out[s.classKey] || !s.admissionYear) continue;
    const sem = currentSemester(s.admissionYear);
    const tt =
      tts.find((t) => squash(t.branch) === squash(s.branch) && Number(t.semester) === sem && sameSection(t.branch, t.section, s.section)) ??
      (squash(s.branch) === "MNC" ? tts.find((t) => squash(t.branch) === "CSE" && Number(t.semester) === sem && sameSection("CSE", t.section, s.section)) : undefined);
    const keys: string[] = [];
    for (const iso of dates) {
      const [y, m, d] = iso.split("-").map(Number);
      const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
      const day = tt?.days?.find((x) => String(x.day).slice(0, 3).toLowerCase() === wd);
      for (const sl of day?.slots ?? []) {
        const s0 = toMinutes(sl.startTime);
        const s1 = toMinutes(sl.endTime);
        if (s0 < 0 || s1 < 0) continue;
        if (s0 < b && s1 > a) keys.push(`${sl.subjectCode}|${iso}`);
      }
    }
    out[s.classKey] = Array.from(new Set(keys));
  }
  return out;
}

async function tokensForEmail(email: string): Promise<string[]> {
  if (!email) return [];
  const snap = await getFirestore().collection("users").where("email", "==", norm(email)).limit(1).get();
  return snap.empty ? [] : tokensOf(snap.docs[0].data() as UserDoc);
}

async function tokensForRegNos(regs: string[]): Promise<string[]> {
  const db = getFirestore();
  const out = new Set<string>();
  for (let i = 0; i < regs.length; i += 30) {
    const snap = await db.collection("users").where("enrollmentNumber", "in", regs.slice(i, i + 30)).get();
    snap.docs.forEach((d) => tokensOf(d.data() as UserDoc).forEach((t) => out.add(t)));
  }
  return Array.from(out);
}

function isLeadOf(club: Record<string, unknown>, c: Caller): boolean {
  const extra = Array.isArray(club.additionalLeadEmails) ? (club.additionalLeadEmails as string[]).map(norm) : [];
  return club.leadUid === c.uid || norm(club.leadEmail) === c.email || extra.includes(c.email);
}

const when = (from: string, to: string) => (from === to ? from : `${from} to ${to}`);

export const excusalSubmit = onCall({region: REGION, timeoutSeconds: 120}, async (req) => {
  const c = await caller(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const db = getFirestore();

  const clubId = txt(d.clubId, 60);
  const clubSnap = clubId ? await db.collection("clubs").doc(clubId).get() : null;
  if (!clubSnap?.exists) throw new HttpsError("invalid-argument", "Pick your club.");
  const club = clubSnap.data() as Record<string, unknown>;
  if (!c.admin && !isLeadOf(club, c)) throw new HttpsError("permission-denied", "Only this club's lead can send its excusal list.");
  const parentId = (club.parentClubId as string | null) || clubSnap.id;
  const parentSnap = parentId === clubSnap.id ? clubSnap : await db.collection("clubs").doc(parentId).get();
  const parentName = String((parentSnap.data() ?? {}).name ?? club.name);

  const cfg = await loadCfg();
  const fic = cfg.fic?.[parentId];
  const missing = [!fic?.email && `FIC for ${parentName}`, !cfg.dsw?.email && "Dean, Student Welfare", !cfg.dean?.email && "Dean, Academics"].filter(Boolean);
  if (missing.length) throw new HttpsError("failed-precondition", `Event excusal isn't set up yet (${missing.join(", ")} missing). Ask the admin to fill it in the faculty portal.`);

  const eventName = txt(d.eventName, 120);
  if (eventName.length < 3) throw new HttpsError("invalid-argument", "Enter the event name.");
  const category = EXCUSAL_CATEGORIES.includes(d.category as (typeof EXCUSAL_CATEGORIES)[number]) ? (d.category as string) : "Other";
  const fromDate = d.fromDate;
  const toDate = d.toDate;
  if (!isIso(fromDate) || !isIso(toDate) || toDate < fromDate) throw new HttpsError("invalid-argument", "Pick valid dates.");
  if (datesBetween(fromDate, toDate).length > MAX_DAYS) throw new HttpsError("invalid-argument", `One request can cover at most ${MAX_DAYS} days.`);
  const fullDay = d.fullDay !== false;
  const fromTime = fullDay ? null : d.fromTime;
  const toTime = fullDay ? null : d.toTime;
  if (!fullDay && (!isTime(fromTime) || !isTime(toTime) || toTime <= fromTime)) throw new HttpsError("invalid-argument", "Pick a valid time window.");

  const regs = Array.from(new Set((Array.isArray(d.students) ? d.students : []).map((r) => squash(r)).filter(Boolean)));
  if (regs.length === 0) throw new HttpsError("invalid-argument", "Add at least one student.");
  if (regs.length > MAX_STUDENTS) throw new HttpsError("invalid-argument", `At most ${MAX_STUDENTS} students per request.`);
  const rosterDocs = await db.getAll(...regs.map((r) => db.collection("roster").doc(r)));
  const unknown = rosterDocs.filter((s) => !s.exists).map((s) => s.id);
  if (unknown.length) throw new HttpsError("invalid-argument", `Not on the student list: ${unknown.slice(0, 10).join(", ")}${unknown.length > 10 ? "…" : ""}`);
  const students: Student[] = rosterDocs.map((s) => {
    const r = s.data() as {name?: string; branch?: string; section?: string | null; admissionYear?: number};
    const branch = String(r.branch ?? "");
    const sem = r.admissionYear ? currentSemester(Number(r.admissionYear)) : null;
    return {
      regNo: s.id,
      name: String(r.name ?? s.id),
      branch,
      section: r.section ?? null,
      admissionYear: r.admissionYear ?? null,
      classKey: sem ? `${squash(branch)}_${sem}_${squash(r.section ?? "ALL")}` : null,
    };
  });
  students.sort((a, b) => a.regNo.localeCompare(b.regNo));
  const sessionsByClass = fullDay ? null : await sessionsFor(students, fromDate, toDate, fromTime as string, toTime as string);

  const approvers = {
    fic: {name: fic!.name, email: norm(fic!.email)},
    dsw: {name: cfg.dsw!.name, email: norm(cfg.dsw!.email)},
    dean: {name: cfg.dean!.name, email: norm(cfg.dean!.email)},
  };
  const linkedEventId = txt(d.linkedEventId, 60) || null;

  const editId = txt(d.excusalId, 60);
  const ref = editId ? db.collection(COLLECTION).doc(editId) : db.collection(COLLECTION).doc();
  let oldHistory: unknown[] = [];
  let oldCreatedAt: unknown = null;
  if (editId) {
    const old = await ref.get();
    const o = old.data() as {submittedBy?: string; stage?: Stage; flow?: number; history?: unknown[]; createdAt?: unknown} | undefined;
    oldHistory = o?.history ?? [];
    oldCreatedAt = o?.createdAt ?? null;
    if (!old.exists || o?.submittedBy !== c.uid || o?.flow !== 2) throw new HttpsError("permission-denied", "This isn't your request.");
    if (o.stage !== "rejected" && o.stage !== "withdrawn") throw new HttpsError("failed-precondition", "Only a rejected or withdrawn request can be edited and sent again.");
  }

  const event = {at: Timestamp.now(), byName: c.name, byEmail: c.email, action: editId ? "resubmitted" : "submitted", remark: null};
  await ref.set({
    flow: 2,
    eventName,
    category,
    fromDate,
    toDate,
    fullDay,
    fromTime,
    toTime,
    clubId: clubSnap.id,
    clubName: String(club.name ?? ""),
    parentClubId: parentId,
    parentClubName: parentName,
    linkedEventId,
    students,
    studentEnrollmentNumbers: students.map((s) => s.regNo),
    sessionsByClass,
    submittedBy: c.uid,
    submittedByName: c.name,
    submittedByEmail: c.email,
    approvers,
    approverEmails: [approvers.fic.email, approvers.dsw.email, approvers.dean.email],
    stage: "fic",
    status: "pending",
    currentApproverEmail: approvers.fic.email,
    signatures: {},
    history: [...oldHistory, event],
    rejectedReason: null,
    // Old one-faculty fields, kept so older app versions still list it sensibly.
    facultyCoordinatorUid: null,
    facultyCoordinatorName: approvers.fic.name,
    facultyCoordinatorEmail: approvers.fic.email,
    facultyRemark: null,
    createdAt: oldCreatedAt ?? FieldValue.serverTimestamp(),
    stepAt: FieldValue.serverTimestamp(),
    respondedAt: null,
    remindedAt: null,
  }, {merge: false});

  await sendExpoPush(
    await tokensForEmail(approvers.fic.email),
    "Event excusal to sign",
    `${eventName} · ${parentName} · ${students.length} students · ${when(fromDate, toDate)}`,
    "excusalSubmit",
    {screen: "EventExcusalRequests"},
  );
  const covered = sessionsByClass ? Object.values(sessionsByClass).reduce((n, l) => n + l.length, 0) : null;
  return {ok: true, id: ref.id, timedClasses: covered};
});

export const excusalAct = onCall({region: REGION}, async (req) => {
  const c = await caller(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const db = getFirestore();
  const id = txt(d.excusalId, 60);
  if (!id) throw new HttpsError("invalid-argument", "Missing request.");
  const ref = db.collection(COLLECTION).doc(id);
  const action = d.action === "reject" ? "reject" : "sign";
  const signature = action === "sign" ? checkSignature(d.signature) : null;
  const remark = txt(d.remark, 300) || null;
  if (action === "reject" && (!remark || remark.length < 3)) throw new HttpsError("invalid-argument", "Say why it's rejected.");

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "This request no longer exists.");
    const r = snap.data() as {flow?: number; stage: Stage; currentApproverEmail?: string; approvers: Record<string, Person>};
    if (r.flow !== 2) throw new HttpsError("failed-precondition", "This request uses the old process.");
    const step = r.stage as "fic" | "dsw" | "dean";
    if (!STEPS.includes(step)) throw new HttpsError("failed-precondition", "This request is already closed.");
    if (norm(r.currentApproverEmail) !== c.email) throw new HttpsError("permission-denied", "It's not your turn to sign this.");
    const at = Timestamp.now();
    const ev = {at, byName: c.name, byEmail: c.email, action: action === "sign" ? `signed as ${STEP_TITLE[step]}` : `rejected as ${STEP_TITLE[step]}`, remark};
    if (action === "reject") {
      tx.update(ref, {stage: "rejected", status: "rejected", rejectedReason: remark, facultyRemark: remark, respondedAt: at, currentApproverEmail: null, history: FieldValue.arrayUnion(ev)});
      return {stage: "rejected" as Stage, step};
    }
    const next = STEPS[STEPS.indexOf(step) + 1];
    const upd: Record<string, unknown> = {
      [`signatures.${step}`]: {name: c.name, email: c.email, at, remark, signature},
      history: FieldValue.arrayUnion(ev),
      stepAt: at,
      remindedAt: null,
    };
    if (next) {
      upd.stage = next;
      upd.currentApproverEmail = r.approvers[next].email;
    } else {
      upd.stage = "approved";
      upd.status = "approved";
      upd.currentApproverEmail = null;
      upd.respondedAt = at;
      upd.facultyRemark = remark;
    }
    tx.update(ref, upd);
    return {stage: (next ?? "approved") as Stage, step};
  });

  if (signature && d.saveSignature) {
    await db.collection("signatures").doc(c.uid).set({...signature, name: c.name, updatedAt: FieldValue.serverTimestamp()}).catch(() => undefined);
  }

  const r = (await ref.get()).data() as {eventName: string; parentClubName: string; submittedBy: string; studentEnrollmentNumbers: string[]; fromDate: string; toDate: string; approvers: Record<string, Person>};
  const subTokens = tokensOf((await db.collection("users").doc(r.submittedBy).get()).data() as UserDoc);
  const label = `${r.eventName} · ${when(r.fromDate, r.toDate)}`;
  if (result.stage === "rejected") {
    await sendExpoPush(subTokens, "Event excusal rejected", `${STEP_TITLE[result.step]} (${c.name}): ${remark}`, "excusalAct", {screen: "SubmitEventExcusal"});
  } else if (result.stage === "approved") {
    await sendExpoPush(subTokens, "Event excusal approved", `${label}. Attendance is updated for all ${r.studentEnrollmentNumbers.length} students.`, "excusalAct", {screen: "SubmitEventExcusal"});
    await sendExpoPush(await tokensForRegNos(r.studentEnrollmentNumbers), "You're excused for an event", `${label}. Those classes count as attended.`, "excusalAct", {screen: "MyAttendance"});
  } else {
    const nextStep = result.stage as "dsw" | "dean";
    await sendExpoPush(await tokensForEmail(r.approvers[nextStep].email), "Event excusal to sign", `${r.eventName} · ${r.parentClubName} · signed by ${STEP_TITLE[result.step]}`, "excusalAct", {screen: "EventExcusalRequests"});
    await sendExpoPush(subTokens, `Signed by ${STEP_TITLE[result.step]}`, `${label}. Now with ${STEP_TITLE[nextStep]}.`, "excusalAct", {screen: "SubmitEventExcusal"});
  }
  return {ok: true, stage: result.stage};
});

export const excusalWithdraw = onCall({region: REGION}, async (req) => {
  const c = await caller(req);
  const id = txt((req.data ?? {}).excusalId, 60);
  const ref = getFirestore().collection(COLLECTION).doc(id);
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const r = snap.data() as {flow?: number; submittedBy?: string; stage?: Stage} | undefined;
    if (!snap.exists || r?.flow !== 2 || r.submittedBy !== c.uid) throw new HttpsError("permission-denied", "This isn't your request.");
    if (!STEPS.includes(r.stage as "fic")) throw new HttpsError("failed-precondition", "This request is already closed.");
    tx.update(ref, {
      stage: "withdrawn",
      status: "withdrawn",
      currentApproverEmail: null,
      history: FieldValue.arrayUnion({at: Timestamp.now(), byName: c.name, byEmail: c.email, action: "withdrawn", remark: null}),
    });
  });
  return {ok: true};
});

// 10:30 AM daily: nudge whoever has had a request waiting for more than a day.
export const excusalReminder = onSchedule({schedule: "30 10 * * *", timeZone: "Asia/Kolkata", region: REGION}, async () => {
  const db = getFirestore();
  const snap = await db.collection(COLLECTION).where("status", "==", "pending").get();
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const byEmail = new Map<string, number>();
  for (const d of snap.docs) {
    const r = d.data() as {flow?: number; currentApproverEmail?: string; stepAt?: Timestamp; remindedAt?: Timestamp | null};
    if (r.flow !== 2 || !r.currentApproverEmail || !r.stepAt) continue;
    if (r.stepAt.toMillis() > dayAgo) continue;
    if (r.remindedAt && r.remindedAt.toMillis() > dayAgo) continue;
    byEmail.set(r.currentApproverEmail, (byEmail.get(r.currentApproverEmail) ?? 0) + 1);
    await d.ref.update({remindedAt: FieldValue.serverTimestamp()});
  }
  for (const [email, n] of byEmail) {
    await sendExpoPush(await tokensForEmail(email), `${n} event excusal${n === 1 ? "" : "s"} waiting for you`, "Open CollegeGo to sign or reject.", "excusalReminder", {screen: "EventExcusalRequests"});
  }
});
