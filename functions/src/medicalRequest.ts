import {onCall, HttpsError, CallableRequest} from "firebase-functions/v2/https";
import {tokensOf, type UserDoc} from "./audience";
import {defineSecret} from "firebase-functions/params";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import * as crypto from "crypto";
import * as nodemailer from "nodemailer";
import {sendExpoPush} from "./expoPush";
import {semesterOn} from "./medicalLeaveTeachers";
import {AuditRow, clean, daysBetween, fmtIso, renderBundle, renderMedicalForm} from "./medicalPdf";
import {rateLimit} from "./rateLimit";
import {
  LATE_LIMIT_DAYS,
  MedicalAttachment,
  MedicalRequest,
  MedicalSign,
  MedicalSignRole,
  ROLE_TITLE,
  SignatureVector,
  SIGNOFF_ROLES,
} from "./medicalTypes";

const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");

const REGION = "asia-south1";
const COLLECTION = "leaveApplications";
const PORTAL_URL = "https://collegego-faculty.web.app/#medicalLeaves";
const APP_URL = "https://collegego-iiitsurat.web.app";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 8;
const MAX_DAYS = 60;
const ACTIVE: MedicalRequest["stage"][] = ["office", "returned", "medical", "signoff"];

type Person = {name: string; email: string};
type Cfg = {
  office?: Person;
  medicalOfficer?: Person;
  doctor?: Person;
  hods?: (Person & {department: string})[];
  hodByBranch?: Record<string, Person>;
  dean?: Person;
  jr?: Person;
};
type Caller = {uid: string; email: string; name: string; role: string; admin: boolean; designation: string | null};
type Event = {
  at: FirebaseFirestore.FieldValue | Timestamp;
  byUid: string;
  byName: string;
  byEmail: string;
  role: string;
  action: string;
  decision?: string | null;
  note?: string | null;
};

const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();
const txt = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const uniq = (a: (string | null | undefined)[]) => Array.from(new Set(a.map(norm).filter(Boolean)));

function todayIst(d = new Date()): string {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"}[c] as string));
}

async function caller(req: CallableRequest): Promise<Caller> {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const snap = await getFirestore().collection("users").doc(req.auth.uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "Your account isn't set up yet.");
  const u = snap.data() as {name?: string; email?: string; role?: string; isAdmin?: boolean; designation?: string};
  const email = norm(u.email ?? req.auth.token.email);
  return {
    uid: req.auth.uid,
    email,
    name: u.name || email.split("@")[0],
    role: u.role ?? "",
    admin: u.role === "admin" || u.isAdmin === true,
    designation: u.designation ?? null,
  };
}

async function loadCfg(): Promise<Required<Pick<Cfg, "office" | "medicalOfficer" | "dean" | "jr">> & Cfg> {
  const snap = await getFirestore().collection("config").doc("medicalLeave").get();
  const c = (snap.data() ?? {}) as Cfg;
  const mo = c.medicalOfficer ?? c.doctor;
  const missing = [
    !c.office?.email && "Academic Office",
    !mo?.email && "Medical Officer",
    !c.dean?.email && "Associate Dean",
    !c.jr?.email && "Joint Registrar",
  ].filter(Boolean);
  if (missing.length) {
    throw new HttpsError("failed-precondition", `Medical leave isn't set up yet (${missing.join(", ")} missing). Contact the admin.`);
  }
  const lower = (p: Person) => ({name: p.name, email: norm(p.email)});
  return {...c, office: lower(c.office as Person), medicalOfficer: lower(mo as Person), dean: lower(c.dean as Person), jr: lower(c.jr as Person)};
}

function hodList(c: Cfg): (Person & {department: string})[] {
  if (c.hods?.length) return c.hods.filter((h) => h.email).map((h) => ({...h, email: norm(h.email)}));
  return Object.entries(c.hodByBranch ?? {}).filter(([, h]) => h?.email).map(([department, h]) => ({...h, email: norm(h.email), department}));
}

function checkSignature(v: unknown): SignatureVector {
  const s = v as SignatureVector | undefined;
  if (!s || typeof s !== "object") throw new HttpsError("invalid-argument", "Add your signature.");
  const w = Number(s.w);
  const h = Number(s.h);
  if (!(w > 0 && w < 4000 && h > 0 && h < 4000)) throw new HttpsError("invalid-argument", "Signature size is invalid.");
  if (typeof s.png === "string" && s.png) {
    if (s.png.length > 130000 || !/^[A-Za-z0-9+/=]+$/.test(s.png)) throw new HttpsError("invalid-argument", "Signature image is too large. Upload a smaller one.");
    const head = Buffer.from(s.png.slice(0, 16), "base64");
    if (!(head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47)) throw new HttpsError("invalid-argument", "Signature image is invalid. Upload it again.");
    return {w: Math.round(w), h: Math.round(h), paths: [], png: s.png};
  }
  if (!Array.isArray(s.paths)) throw new HttpsError("invalid-argument", "Add your signature.");
  const paths = s.paths.map(String).filter((p) => p.length > 0);
  if (paths.length === 0 || paths.length > 200) throw new HttpsError("invalid-argument", "Draw your signature first.");
  const total = paths.reduce((n, p) => n + p.length, 0);
  if (total > 40000 || !paths.every((p) => /^[MLQC0-9 .,-]+$/.test(p))) {
    throw new HttpsError("invalid-argument", "Signature data is invalid. Clear it and sign again.");
  }
  return {w: Math.round(w), h: Math.round(h), paths};
}

async function verifyAttachments(raw: unknown, prefix: string, byUid: string, byRole: MedicalAttachment["byRole"]): Promise<MedicalAttachment[]> {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new HttpsError("invalid-argument", "Attachments are invalid.");
  if (raw.length > MAX_FILES) throw new HttpsError("invalid-argument", `Attach at most ${MAX_FILES} files.`);
  const bucket = getStorage().bucket();
  const out: MedicalAttachment[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const path = String(r?.path ?? "");
    if (!path.startsWith(prefix) || path.includes("..")) throw new HttpsError("invalid-argument", "An attachment is in the wrong place. Upload it again.");
    const kind = (["report", "intimation", "certificate", "other"] as const).find((k) => k === r?.kind) ?? "other";
    let meta: {size?: string | number; contentType?: string; timeCreated?: string};
    try {
      [meta] = await bucket.file(path).getMetadata();
    } catch {
      throw new HttpsError("invalid-argument", `"${txt(r?.name, 80)}" didn't finish uploading. Remove it and attach it again.`);
    }
    const size = Number(meta.size ?? 0);
    const contentType = String(meta.contentType ?? "");
    if (size > MAX_FILE_BYTES) throw new HttpsError("invalid-argument", `"${txt(r?.name, 80)}" is over 10 MB.`);
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(contentType) && contentType !== "application/pdf") {
      throw new HttpsError("invalid-argument", `"${txt(r?.name, 80)}" must be a PDF or a photo.`);
    }
    out.push({
      id: txt(r?.id, 40) || crypto.randomBytes(6).toString("hex"),
      kind,
      name: txt(r?.name, 120) || path.split("/").pop() || "file",
      path,
      contentType,
      size,
      uploadedAt: meta.timeCreated ? Date.parse(meta.timeCreated) : Date.now(),
      byUid,
      byRole,
    });
  }
  return out;
}

function pendingFor(r: MedicalRequest): string[] {
  switch (r.stage) {
  case "office": return [r.officeEmail];
  case "medical": return [r.medicalEmail];
  case "signoff": return uniq(SIGNOFF_ROLES.filter((k) => !r[`${k}Sign` as const]).map((k) => r[`${k}Email` as const] as string));
  default: return [];
  }
}

function who(r: MedicalRequest): string {
  return `${r.studentName}${r.studentEnrollmentNumber ? ` (${r.studentEnrollmentNumber})` : ""}`;
}

function period(r: MedicalRequest): string {
  return r.fromDate === r.toDate ? fmtIso(r.fromDate) : `${fmtIso(r.fromDate)} to ${fmtIso(r.toDate)}`;
}

async function tokensFor(emails: string[], uids: string[]): Promise<string[]> {
  const db = getFirestore();
  const tokens = new Set<string>();
  const list = uniq(emails);
  for (let i = 0; i < list.length; i += 30) {
    const snap = await db.collection("users").where("email", "in", list.slice(i, i + 30)).get();
    snap.forEach((d) => {
      tokensOf(d.data() as UserDoc).forEach((t) => tokens.add(t));
    });
  }
  for (const uid of uids) {
    tokensOf((await db.collection("users").doc(uid).get()).data() as UserDoc | undefined).forEach((t) => tokens.add(t));
  }
  return Array.from(tokens);
}

type Mail = {to: string[]; subject: string; lines: string[]; cta?: {label: string; url: string}; attach?: {name: string; bytes: Uint8Array}};

async function sendMails(mails: Mail[]) {
  const user = (() => {
    try {
      return smtpUser.value();
    } catch {
      return "";
    }
  })();
  if (!user || mails.length === 0) return;
  const transport = nodemailer.createTransport({service: "gmail", auth: {user, pass: smtpPass.value()}});
  await Promise.all(mails.filter((m) => m.to.length).map((m) =>
    transport.sendMail({
      from: `"IIIT Surat Medical Leave (CollegeGo)" <${user}>`,
      to: uniq(m.to).join(", "),
      subject: m.subject,
      text: [...m.lines, ...(m.cta ? ["", `${m.cta.label}: ${m.cta.url}`] : []), "", "This is an automated message from CollegeGo for IIIT Surat."].join("\n"),
      html:
        "<div style=\"font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827\">" +
        "<p style=\"margin:0 0 4px;font-size:12px;color:#6b7280;letter-spacing:.06em\">IIIT SURAT · MEDICAL LEAVE</p>" +
        `<h2 style="margin:0 0 14px;font-size:20px">${esc(m.subject)}</h2>` +
        m.lines.map((l) => `<p style="margin:0 0 8px;line-height:1.5">${esc(l)}</p>`).join("") +
        (m.cta ? `<p style="margin:18px 0"><a href="${esc(m.cta.url)}" style="background:#1f3a8a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">${esc(m.cta.label)}</a></p>` : "") +
        "<p style=\"margin-top:22px;font-size:12px;color:#6b7280\">This is an automated message from CollegeGo for IIIT Surat.</p></div>",
      attachments: m.attach ? [{filename: m.attach.name, content: Buffer.from(m.attach.bytes), contentType: "application/pdf"}] : undefined,
    }).catch((e) => console.error("[medicalRequest] mail failed", m.subject, e?.message ?? e)),
  ));
}

async function push(emails: string[], uids: string[], title: string, body: string, leaveId: string) {
  try {
    const screen = uids.length ? "ApplyLeave" : "LeaveRequests";
    await sendExpoPush(await tokensFor(emails, uids), title, body, "medicalRequest", {type: "medicalLeave", leaveId, screen});
  } catch (e) {
    console.error("[medicalRequest] push failed", e);
  }
}

function newToken(): string {
  return crypto.randomUUID();
}

async function saveFile(path: string, bytes: Uint8Array) {
  await getStorage().bucket().file(path).save(Buffer.from(bytes), {
    resumable: false,
    contentType: "application/pdf",
    metadata: {cacheControl: "private, max-age=0", metadata: {firebaseStorageDownloadTokens: newToken()}},
  });
}

async function rebuildForm(ref: FirebaseFirestore.DocumentReference): Promise<{bytes: Uint8Array; req: MedicalRequest} | null> {
  const snap = await ref.get();
  if (!snap.exists) return null;
  const req = snap.data() as MedicalRequest;
  const bytes = await renderMedicalForm(req, {generatedAt: new Date()});
  const hash = crypto.createHash("sha256").update(bytes.subarray(0, bytes.length)).digest("hex");
  const path = `medicalLeaves/${req.studentUid}/${ref.id}/form.pdf`;
  await saveFile(path, bytes);
  await ref.update({formPdfPath: path, formPdfHash: hash, formVersion: FieldValue.increment(1), formUpdatedAt: FieldValue.serverTimestamp()});
  return {bytes, req};
}

async function buildBundle(ref: FirebaseFirestore.DocumentReference, formBytes: Uint8Array) {
  const snap = await ref.get();
  const req = snap.data() as MedicalRequest;
  const ev = await ref.collection("events").orderBy("at").get();
  const audit: AuditRow[] = ev.docs.map((d) => {
    const e = d.data() as Event;
    return {
      at: e.at instanceof Timestamp ? e.at.toDate() : null,
      who: `${e.byName}${e.role ? ` (${e.role})` : ""}`,
      action: e.decision === "not_approved" ? "Not approved" : e.decision === "approved" ? "Approved" : e.action,
      note: e.note ?? null,
    };
  });
  const bucket = getStorage().bucket();
  const files: {att: MedicalAttachment; bytes: Uint8Array}[] = [];
  let total = 0;
  for (const att of req.attachments ?? []) {
    if (total + att.size > 40 * 1024 * 1024) break;
    try {
      const [buf] = await bucket.file(att.path).download();
      files.push({att, bytes: new Uint8Array(buf)});
      total += buf.length;
    } catch (e) {
      console.error("[medicalRequest] attachment missing", att.path, e);
    }
  }
  const bytes = await renderBundle(formBytes, req, audit, files, new Date());
  const path = `medicalLeaves/${req.studentUid}/${ref.id}/bundle.pdf`;
  await saveFile(path, bytes);
  await ref.update({bundlePath: path, bundleUpdatedAt: FieldValue.serverTimestamp()});
}

async function afterChange(ref: FirebaseFirestore.DocumentReference, final: boolean): Promise<Uint8Array | null> {
  try {
    const out = await rebuildForm(ref);
    if (!out) return null;
    if (final) await buildBundle(ref, out.bytes);
    return out.bytes;
  } catch (e) {
    console.error("[medicalRequest] pdf build failed", ref.id, e);
    return null;
  }
}

function addEvent(tx: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, c: Caller, role: string, action: string, extra: Partial<Event> = {}) {
  tx.set(ref.collection("events").doc(), {
    at: FieldValue.serverTimestamp(),
    byUid: c.uid,
    byName: c.name,
    byEmail: c.email,
    role,
    action,
    decision: extra.decision ?? null,
    note: extra.note ?? null,
  });
}

const OPTS = {region: REGION, secrets: [smtpUser, smtpPass], timeoutSeconds: 120, memory: "512MiB" as const};

export const medicalSubmit = onCall(OPTS, async (req) => {
  const c = await caller(req);
  await rateLimit(`medicalSubmit:${c.uid}`, 15, 60 * 60 * 1000);
  if (c.role !== "student") throw new HttpsError("permission-denied", "Only students can apply for medical leave.");
  const d = (req.data ?? {}) as Record<string, unknown>;
  const leaveId = String(d.leaveId ?? "");
  if (!/^[A-Za-z0-9]{16,40}$/.test(leaveId)) throw new HttpsError("invalid-argument", "Invalid request id.");

  const fromDate = d.fromDate;
  const toDate = d.toDate;
  const rejoinedOn = d.rejoinedOn;
  if (!isIso(fromDate) || !isIso(toDate) || !isIso(rejoinedOn)) throw new HttpsError("invalid-argument", "Pick valid dates.");
  const today = todayIst();
  if (toDate < fromDate) throw new HttpsError("invalid-argument", "The last day of absence can't be before the first day.");
  if (daysBetween(fromDate, toDate) + 1 > MAX_DAYS) throw new HttpsError("invalid-argument", `A single request can cover at most ${MAX_DAYS} days.`);
  if (rejoinedOn <= toDate) throw new HttpsError("invalid-argument", "The rejoining date must be after the last day of absence.");
  if (rejoinedOn > today) throw new HttpsError("invalid-argument", "Apply after you rejoin. The rejoining date can't be in the future.");
  const reason = txt(d.reason, 600);
  if (reason.length < 10) throw new HttpsError("invalid-argument", "Describe the medical reason (at least 10 characters).");
  const cgpaRaw = txt(d.cgpa, 6);
  if (cgpaRaw && !(/^\d{1,2}(\.\d{1,2})?$/.test(cgpaRaw) && Number(cgpaRaw) <= 10)) throw new HttpsError("invalid-argument", "CGPA must be between 0 and 10.");
  const intimationSent = d.intimationSent === true;
  const intimationDate = intimationSent && isIso(d.intimationDate) ? (d.intimationDate as string) : null;
  if (intimationSent && !intimationDate) throw new HttpsError("invalid-argument", "Pick the date you sent the intimation email.");

  const cfg = await loadCfg();
  const hod = hodList(cfg).find((h) => h.email === norm(d.hodEmail));
  if (!hod) throw new HttpsError("invalid-argument", "Pick your department's HOD.");

  const attachments = await verifyAttachments(d.attachments, `medicalLeaves/${c.uid}/${leaveId}/student/`, c.uid, "student");
  if (!attachments.some((a) => a.kind === "report")) throw new HttpsError("invalid-argument", "Attach at least one medical report or prescription.");

  const db = getFirestore();
  const userSnap = await db.collection("users").doc(c.uid).get();
  const u = userSnap.data() as {name?: string; enrollmentNumber?: string; branch?: string; section?: string; admissionYear?: number; email?: string};
  const semester = u.admissionYear ? semesterOn(u.admissionYear, fromDate) : null;
  const yearOfStudy = semester ? Math.ceil(semester / 2) : null;

  const overlapping = await db.collection(COLLECTION)
    .where("studentUid", "==", c.uid)
    .where("type", "==", "medical")
    .get();
  const clash = overlapping.docs.find((x) => {
    if (x.id === leaveId) return false;
    const o = x.data() as MedicalRequest;
    const live = o.flow === 2 ? ACTIVE.includes(o.stage) || o.status === "approved" : o.status !== "rejected";
    return live && o.fromDate <= toDate && fromDate <= o.toDate;
  });
  if (clash) throw new HttpsError("already-exists", "You already have a medical leave request covering some of these dates.");

  const ref = db.collection(COLLECTION).doc(leaveId);
  const counter = db.collection("counters").doc(`medical-${today.slice(0, 4)}`);
  let resubmitted = false;
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const base = {
      cgpa: cgpaRaw || null,
      reason,
      fromDate,
      toDate,
      rejoinedOn,
      intimationSent,
      intimationDate,
      intimationMissing: !attachments.some((a) => a.kind === "intimation"),
      intimationLate: intimationDate ? daysBetween(fromDate, intimationDate) > 1 : true,
      hodEmail: hod.email,
      hodName: hod.name,
      hodDepartment: hod.department,
    };
    if (cur.exists) {
      const old = cur.data() as MedicalRequest;
      if (old.studentUid !== c.uid || old.flow !== 2) throw new HttpsError("permission-denied", "This isn't your request.");
      if (old.stage !== "returned") throw new HttpsError("failed-precondition", "This request is already being processed.");
      const submitted = old.submittedAt?.toDate() ?? new Date();
      const days = daysBetween(rejoinedOn, todayIst(submitted));
      const keep = (old.attachments ?? []).filter((a) => a.byRole === "medical");
      const next: Record<string, unknown> = {
        ...base,
        attachments: [...attachments, ...keep],
        daysAfterRejoining: days,
        late: days > LATE_LIMIT_DAYS,
        stage: "office",
        status: "pending",
        returnNote: null,
        returnedBy: null,
        resubmissions: FieldValue.increment(1),
        resubmittedAt: FieldValue.serverTimestamp(),
        medicalSign: null,
      };
      next.pendingEmails = [old.officeEmail];
      tx.update(ref, next);
      addEvent(tx, ref, c, "Student", "Resubmitted");
      resubmitted = true;
      return;
    }
    const cnt = await tx.get(counter);
    const n = ((cnt.data()?.n as number | undefined) ?? 0) + 1;
    tx.set(counter, {n, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    const days = daysBetween(rejoinedOn, today);
    const doc: MedicalRequest & Record<string, unknown> = {
      ...base,
      type: "medical",
      flow: 2,
      stage: "office",
      status: "pending",
      refNo: `IIITS/MED/${today.slice(0, 4)}/${String(n).padStart(4, "0")}`,
      studentUid: c.uid,
      studentName: u.name || c.name,
      studentEnrollmentNumber: u.enrollmentNumber ?? null,
      studentEmail: norm(u.email ?? c.email),
      branch: u.branch ?? null,
      section: u.section ?? null,
      semester,
      yearOfStudy,
      attachments,
      officeEmail: cfg.office.email,
      officeName: cfg.office.name,
      medicalEmail: cfg.medicalOfficer.email,
      medicalName: cfg.medicalOfficer.name,
      deanEmail: cfg.dean.email,
      deanName: cfg.dean.name,
      jrEmail: cfg.jr.email,
      jrName: cfg.jr.name,
      officeReview: null,
      medicalSign: null,
      hodSign: null,
      deanSign: null,
      jrSign: null,
      late: days > LATE_LIMIT_DAYS,
      daysAfterRejoining: days,
      finalDecision: null,
      viewerEmails: uniq([cfg.office.email, cfg.medicalOfficer.email, hod.email, cfg.dean.email, cfg.jr.email]),
      pendingEmails: [cfg.office.email],
      resubmissions: 0,
      formVersion: 0,
      createdAt: FieldValue.serverTimestamp() as unknown as Timestamp,
      submittedAt: FieldValue.serverTimestamp() as unknown as Timestamp,
      decidedAt: null,
    };
    tx.set(ref, doc);
    addEvent(tx, ref, c, "Student", "Submitted", {note: days > LATE_LIMIT_DAYS ? `Late: ${days} days after rejoining` : null});
  });

  const formBytes = await afterChange(ref, false);
  const r = (await ref.get()).data() as MedicalRequest;
  const flags = [
    r.late ? `Submitted ${r.daysAfterRejoining} days after rejoining (limit ${LATE_LIMIT_DAYS}).` : null,
    r.intimationMissing ? "No copy of the intimation email is attached." : null,
  ].filter(Boolean) as string[];
  await Promise.all([
    push([r.officeEmail], [], resubmitted ? "Medical leave resubmitted" : "New medical leave application",
      `${r.refNo} · ${who(r)} · ${period(r)}${r.late ? " · LATE" : ""}`, ref.id),
    sendMails([
      {
        to: [r.officeEmail],
        subject: `${resubmitted ? "Resubmitted" : "New"} medical leave application ${r.refNo}`,
        lines: [
          `${who(r)}, ${r.branch ?? ""}${r.semester ? ` Semester ${r.semester}` : ""}`,
          `Absent: ${period(r)}. Rejoined on ${fmtIso(r.rejoinedOn)}.`,
          `Reason: ${r.reason}`,
          `HOD: ${r.hodName}`,
          ...flags.map((f) => `Flag: ${f}`),
          "Please check the documents and forward it to the Medical Officer, or return it to the student.",
        ],
        cta: {label: "Open in Faculty Portal", url: PORTAL_URL},
        attach: formBytes ? {name: `${clean(r.refNo).replace(/\//g, "-")}.pdf`, bytes: formBytes} : undefined,
      },
      {
        to: r.studentEmail ? [r.studentEmail] : [],
        subject: `Medical leave ${resubmitted ? "resubmitted" : "received"}: ${r.refNo}`,
        lines: [
          `Your request for ${period(r)} has been ${resubmitted ? "resubmitted" : "received"} by the Academic Office.`,
          ...(r.late ? [`Note: it was submitted ${r.daysAfterRejoining} days after rejoining, which is beyond the ${LATE_LIMIT_DAYS}-day limit. It is flagged as late.`] : []),
          "You'll get an update at each step. You can track it in the CollegeGo app.",
        ],
        cta: {label: "Track in CollegeGo", url: APP_URL},
      },
    ]),
  ]);
  return {ok: true, refNo: r.refNo, late: !!r.late, daysAfterRejoining: r.daysAfterRejoining ?? null};
});

type ActInput = {
  leaveId: string;
  action: "forward" | "return" | "sign" | "withdraw" | "rebuild";
  role?: MedicalSignRole;
  decision?: "approved" | "not_approved";
  comment?: string;
  note?: string;
  signature?: SignatureVector;
  saveSignature?: boolean;
  attachments?: unknown;
};

export const medicalAct = onCall(OPTS, async (req) => {
  const c = await caller(req);
  await rateLimit(`medicalAct:${c.uid}`, 200, 60 * 60 * 1000);
  const d = (req.data ?? {}) as ActInput;
  const leaveId = String(d.leaveId ?? "");
  if (!/^[A-Za-z0-9]{16,40}$/.test(leaveId)) throw new HttpsError("invalid-argument", "Invalid request id.");
  const db = getFirestore();
  const ref = db.collection(COLLECTION).doc(leaveId);
  const first = await ref.get();
  if (!first.exists) throw new HttpsError("not-found", "This request no longer exists.");
  const r0 = first.data() as MedicalRequest;
  if (r0.flow !== 2) throw new HttpsError("failed-precondition", "This request uses the old process.");

  const isOffice = c.email === r0.officeEmail;
  const roleEmail = (role: MedicalSignRole) => (role === "medical" ? r0.medicalEmail : r0[`${role}Email` as const]) as string;

  if (d.action === "rebuild") {
    if (!(isOffice || c.admin || c.uid === r0.studentUid || (r0.viewerEmails ?? []).includes(c.email))) {
      throw new HttpsError("permission-denied", "You can't access this request.");
    }
    const final = ["teachers", "done", "rejected"].includes(r0.stage);
    const bytes = await afterChange(ref, final);
    if (!bytes) throw new HttpsError("internal", "Couldn't build the PDF. Try again in a minute.");
    return {ok: true};
  }

  let signature: SignatureVector | null = null;
  let extraFiles: MedicalAttachment[] = [];
  if (d.action === "sign") {
    const role = d.role;
    if (!role || !["medical", "hod", "dean", "jr"].includes(role)) throw new HttpsError("invalid-argument", "Pick the role you're signing as.");
    if (c.email !== norm(roleEmail(role))) throw new HttpsError("permission-denied", `Only the ${ROLE_TITLE[role]} on this request can sign here.`);
    if (d.decision !== "approved" && d.decision !== "not_approved") throw new HttpsError("invalid-argument", "Choose Approve or Not approve.");
    if (d.decision === "not_approved" && txt(d.comment, 400).length < 3) throw new HttpsError("invalid-argument", "Add a comment explaining why it isn't approved.");
    if (d.signature) {
      signature = checkSignature(d.signature);
    } else {
      const saved = await db.collection("signatures").doc(c.uid).get();
      if (!saved.exists) throw new HttpsError("failed-precondition", "Draw your signature first.");
      signature = checkSignature(saved.data());
    }
    if (role === "medical") {
      extraFiles = await verifyAttachments(d.attachments, `medicalLeaves/${r0.studentUid}/${leaveId}/medical/`, c.uid, "medical");
      extraFiles = extraFiles.map((a) => ({...a, kind: a.kind === "other" ? "certificate" : a.kind}));
    }
  }

  let finalNow = false;
  let label = "";
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const r = snap.data() as MedicalRequest;
    const upd: Record<string, unknown> = {};
    switch (d.action) {
    case "forward": {
      if (!(isOffice || c.admin)) throw new HttpsError("permission-denied", "Only the Academic Office can forward this.");
      if (r.stage !== "office") throw new HttpsError("failed-precondition", "This request isn't waiting for the office.");
      const note = txt(d.note, 400) || null;
      upd.stage = "medical";
      upd.officeReview = {action: "forwarded", note, byUid: c.uid, byName: c.name, at: Timestamp.now()};
      addEvent(tx, ref, c, "Academic Office", "Forwarded to Medical Officer", {note});
      label = "forwarded";
      break;
    }
    case "return": {
      const asOffice = (isOffice || c.admin) && r.stage === "office";
      const asMo = c.email === r.medicalEmail && r.stage === "medical";
      if (!asOffice && !asMo) throw new HttpsError("permission-denied", "You can't return this request right now.");
      const note = txt(d.note, 400);
      if (note.length < 5) throw new HttpsError("invalid-argument", "Tell the student what to fix.");
      upd.stage = "returned";
      upd.returnNote = note;
      upd.returnedBy = asMo ? "Medical Officer" : "Academic Office";
      if (asOffice) upd.officeReview = {action: "returned", note, byUid: c.uid, byName: c.name, at: Timestamp.now()};
      addEvent(tx, ref, c, asMo ? "Medical Officer" : "Academic Office", "Returned to student", {note});
      label = "returned";
      break;
    }
    case "withdraw": {
      if (c.uid !== r.studentUid) throw new HttpsError("permission-denied", "Only the student can withdraw.");
      if (!ACTIVE.includes(r.stage)) throw new HttpsError("failed-precondition", "This request is already closed.");
      upd.stage = "withdrawn";
      upd.status = "withdrawn";
      upd.decidedAt = FieldValue.serverTimestamp();
      addEvent(tx, ref, c, "Student", "Withdrawn", {note: txt(d.note, 300) || null});
      label = "withdrawn";
      break;
    }
    case "sign": {
      const role = d.role as MedicalSignRole;
      const want = role === "medical" ? "medical" : "signoff";
      if (r.stage !== want) throw new HttpsError("failed-precondition", role === "medical" ? "This request isn't waiting for the Medical Officer." : "This request isn't ready for sign-off yet.");
      if (r[`${role}Sign` as const]) throw new HttpsError("failed-precondition", "You've already signed this request.");
      const sign: MedicalSign = {
        decision: d.decision as MedicalSign["decision"],
        comment: txt(d.comment, 400) || null,
        byUid: c.uid,
        byName: c.name,
        byEmail: c.email,
        designation: role === "hod" ? `HOD, ${r.hodDepartment ?? ""}`.replace(/, $/, "") : ROLE_TITLE[role],
        signature: signature as SignatureVector,
        at: Timestamp.now(),
      };
      upd[`${role}Sign`] = sign;
      addEvent(tx, ref, c, ROLE_TITLE[role], d.decision === "approved" ? "Approved" : "Not approved", {decision: d.decision, note: sign.comment});
      const merged = {...r, [`${role}Sign`]: sign} as MedicalRequest;
      if (role === "medical") {
        if (extraFiles.length) upd.attachments = [...(r.attachments ?? []), ...extraFiles];
        if (d.decision === "not_approved") {
          upd.stage = "rejected";
          upd.status = "rejected";
          upd.finalDecision = "not_approved";
          upd.decidedAt = FieldValue.serverTimestamp();
          addEvent(tx, ref, c, "System", "Closed: not approved by the Medical Officer");
          finalNow = true;
        } else {
          upd.stage = "signoff";
        }
      } else if (SIGNOFF_ROLES.every((k) => merged[`${k}Sign` as const])) {
        const ok = SIGNOFF_ROLES.every((k) => merged[`${k}Sign` as const]?.decision === "approved");
        upd.stage = ok ? "teachers" : "rejected";
        upd.status = ok ? "approved" : "rejected";
        upd.finalDecision = ok ? "approved" : "not_approved";
        upd.decidedAt = FieldValue.serverTimestamp();
        upd.resolvedAt = FieldValue.serverTimestamp();
        addEvent(tx, ref, c, "System", ok ? "Final: approved" : "Final: not approved");
        finalNow = true;
      }
      upd.pendingEmails = pendingFor({...merged, stage: (upd.stage as MedicalRequest["stage"]) ?? r.stage});
      label = `signed:${role}`;
      break;
    }
    default:
      throw new HttpsError("invalid-argument", "Unknown action.");
    }
    if (!("pendingEmails" in upd)) upd.pendingEmails = pendingFor({...r, stage: (upd.stage as MedicalRequest["stage"]) ?? r.stage});
    upd.updatedAt = FieldValue.serverTimestamp();
    tx.update(ref, upd);
  });

  if (signature && d.saveSignature) {
    await db.collection("signatures").doc(c.uid).set({...signature, name: c.name, updatedAt: FieldValue.serverTimestamp()}).catch(() => undefined);
  }

  const formBytes = await afterChange(ref, finalNow);
  const r = (await ref.get()).data() as MedicalRequest;
  await notifyStep(r, ref.id, label, finalNow, formBytes);
  return {ok: true, stage: r.stage, finalDecision: r.finalDecision ?? null};
});

async function notifyStep(r: MedicalRequest, id: string, label: string, final: boolean, formBytes: Uint8Array | null) {
  const student = r.studentEmail ? [r.studentEmail] : [];
  const pdf = formBytes ? {name: `${clean(r.refNo ?? id).replace(/\//g, "-")}.pdf`, bytes: formBytes} : undefined;
  const head = `${r.refNo} · ${who(r)} · ${period(r)}`;
  const tasks: Promise<unknown>[] = [];

  if (final) {
    const ok = r.finalDecision === "approved";
    const by = [r.medicalSign, r.hodSign, r.deanSign, r.jrSign].filter((s) => s?.decision === "not_approved").map((s) => `${s?.byName}${s?.comment ? `: "${s.comment}"` : ""}`);
    if (!ok) tasks.push(push([], [r.studentUid], "Medical leave not approved", by[0] ?? `${r.refNo} was not approved.`, id));
    tasks.push(push(uniq([r.officeEmail, r.hodEmail, r.deanEmail, r.jrEmail, r.medicalEmail]), [], ok ? "Medical leave approved" : "Medical leave not approved", head, id));
    tasks.push(sendMails([
      {
        to: student,
        subject: `Medical leave ${ok ? "approved" : "not approved"}: ${r.refNo}`,
        lines: ok ?
          [`Your medical leave for ${period(r)} has been approved by all authorities.`, "Classes in these dates now count as present. Each teacher can still review this.", "The signed form is attached. The full record (form, history and documents) is in the CollegeGo app."] :
          [`Your medical leave for ${period(r)} was not approved.`, ...by.map((b) => `Reason - ${b}`), "The signed form is attached for your records."],
        cta: {label: "Open in CollegeGo", url: APP_URL},
        attach: pdf,
      },
      {
        to: uniq([r.officeEmail, r.hodEmail, r.deanEmail, r.jrEmail, r.medicalEmail]),
        subject: `Medical leave ${ok ? "approved" : "not approved"}: ${r.refNo}`,
        lines: [`${who(r)} · ${period(r)}`, `Final decision: ${ok ? "APPROVED" : "NOT APPROVED"}.`, "The signed form is attached. The complete bundle can be downloaded from the Faculty Portal."],
        cta: {label: "Open records", url: PORTAL_URL},
        attach: pdf,
      },
    ]));
    await Promise.all(tasks);
    return;
  }

  switch (label) {
  case "forwarded":
    tasks.push(push([r.medicalEmail], [], "Medical leave to verify", head, id));
    tasks.push(push([], [r.studentUid], "Sent to the Medical Officer", `The office checked your documents for ${r.refNo} and forwarded them.`, id));
    tasks.push(sendMails([{
      to: [r.medicalEmail],
      subject: `Please verify medical leave ${r.refNo}`,
      lines: [`${who(r)} · ${period(r)}`, `Reason: ${r.reason}`, `${(r.attachments ?? []).length} document(s) attached in the portal.`, ...(r.officeReview?.note ? [`Office note: ${r.officeReview.note}`] : []), "Please review the reports and sign with Approve or Not approve."],
      cta: {label: "Review and sign", url: PORTAL_URL},
      attach: pdf,
    }]));
    break;
  case "returned":
    tasks.push(push([], [r.studentUid], "Medical leave returned to you", `${r.returnedBy}: ${r.returnNote}`, id));
    tasks.push(sendMails([{
      to: student,
      subject: `Action needed on medical leave ${r.refNo}`,
      lines: [`The ${r.returnedBy} returned your request for ${period(r)}.`, `What to fix: ${r.returnNote}`, "Open the request in CollegeGo, make the changes and resubmit."],
      cta: {label: "Fix and resubmit", url: APP_URL},
    }]));
    break;
  case "withdrawn":
    tasks.push(push(r.viewerEmails ?? [], [], "Medical leave withdrawn", head, id));
    break;
  case "signed:medical": {
    const signers = uniq([r.hodEmail, r.deanEmail, r.jrEmail]);
    tasks.push(push(signers, [], "Medical leave needs your signature", `${head} · verified by the Medical Officer`, id));
    tasks.push(push([], [r.studentUid], "Medical Officer approved", "Now with the HOD, Associate Dean and Joint Registrar together.", id));
    tasks.push(sendMails([
      {
        to: signers,
        subject: `Signature needed: medical leave ${r.refNo}`,
        lines: [`${who(r)} · ${period(r)}`, `Verified and recommended by the Medical Officer (${r.medicalSign?.byName}).`, ...(r.late ? [`Flag: submitted ${r.daysAfterRejoining} days after rejoining.`] : []), "The HOD, Associate Dean and Joint Registrar can sign in any order."],
        cta: {label: "Review and sign", url: PORTAL_URL},
        attach: pdf,
      },
      {to: [r.officeEmail], subject: `Verified by Medical Officer: ${r.refNo}`, lines: [`${who(r)} · ${period(r)}`, "Sent to the HOD, Associate Dean and Joint Registrar for sign-off."]},
    ]));
    break;
  }
  default:
    if (label.startsWith("signed:")) {
      const role = label.split(":")[1] as MedicalSignRole;
      const s = r[`${role}Sign` as const];
      const left = SIGNOFF_ROLES.filter((k) => !r[`${k}Sign` as const]).map((k) => ROLE_TITLE[k]);
      tasks.push(push([], [r.studentUid], `${ROLE_TITLE[role]} ${s?.decision === "approved" ? "approved" : "did not approve"}`, left.length ? `Waiting for ${left.join(", ")}.` : "", id));
    }
  }
  await Promise.all(tasks);
}

