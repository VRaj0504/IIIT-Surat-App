import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {studentsFor, tokensOf, type UserDoc} from "./audience";

type StudentAudience = {
  admissionYears?: number[];
  branches?: string[];
  sections?: string[];
  regNos?: string[];
};

type FacultyAudience = {
  departments?: string[];
  emails?: string[];
};

type Meeting = {
  title: string;
  agenda?: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  venue: string;
  status: "scheduled" | "cancelled";
  createdBy: string;
  createdByName?: string;
  audience?: {students?: StudentAudience | null; faculty?: FacultyAudience | null};
  recipientUids?: string[];
};

const squash = (s: unknown) => String(s ?? "").toUpperCase().replace(/[\s_\-.]+/g, "");

function prettyWhen(m: Meeting): string {
  const d = new Date(`${m.date}T00:00:00Z`);
  const day = d.toLocaleDateString("en-IN", {weekday: "short", day: "numeric", month: "short", timeZone: "UTC"});
  const t = (x: string) => {
    const [h, mm] = x.split(":").map(Number);
    return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  };
  return `${day}, ${t(m.startTime)}${m.endTime ? `–${t(m.endTime)}` : ""}`;
}

async function resolveRecipients(m: Meeting): Promise<{uid: string; tokens: string[]}[]> {
  const db = getFirestore();
  const out = new Map<string, string[]>();
  const st = m.audience?.students;
  if (st) {
    const regNos = (st.regNos ?? []).map((r) => String(r).trim().toUpperCase()).filter(Boolean);
    if (regNos.length) {
      for (let i = 0; i < regNos.length; i += 30) {
        const snap = await db.collection("users").where("enrollmentNumber", "in", regNos.slice(i, i + 30)).get();
        snap.docs.forEach((d) => out.set(d.id, tokensOf(d.data() as UserDoc)));
      }
    } else {
      const {matched} = await studentsFor({
        admissionYears: st.admissionYears ?? [],
        branches: st.branches ?? [],
        sections: st.sections ?? [],
      });
      matched.forEach((r) => out.set(r.uid, r.tokens));
    }
  }
  const fa = m.audience?.faculty;
  if (fa) {
    const snap = await db.collection("users").where("role", "==", "faculty").get();
    const depts = (fa.departments ?? []).map(squash).filter(Boolean);
    const emails = (fa.emails ?? []).map((e) => String(e).toLowerCase()).filter(Boolean);
    snap.docs.forEach((d) => {
      const u = d.data() as UserDoc & {email?: string; department?: string};
      if (emails.length && !emails.includes(String(u.email ?? "").toLowerCase())) return;
      if (!emails.length && depts.length && !depts.includes(squash(u.department))) return;
      out.set(d.id, tokensOf(u));
    });
  }
  out.delete(m.createdBy);
  return Array.from(out.entries()).map(([uid, tokens]) => ({uid, tokens}));
}

async function tokensForUids(uids: string[]): Promise<string[]> {
  const db = getFirestore();
  const tokens: string[] = [];
  for (let i = 0; i < uids.length; i += 300) {
    const refs = uids.slice(i, i + 300).map((u) => db.collection("users").doc(u));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s) => tokens.push(...tokensOf(s.data() as UserDoc | undefined)));
  }
  return tokens;
}

export const sendMeetingPush = onDocumentWritten("meetings/{meetingId}", async (event) => {
  const before = event.data?.before?.exists ? (event.data.before.data() as Meeting) : null;
  const afterSnap = event.data?.after;
  if (!afterSnap?.exists) return;
  const m = afterSnap.data() as Meeting;
  const tag = "sendMeetingPush";
  const from = m.createdByName || "Director's office";
  const data = {screen: "Meetings", meetingId: event.params.meetingId};

  if (!before) {
    if (m.status !== "scheduled") return;
    const recipients = await resolveRecipients(m);
    await afterSnap.ref.update({
      recipientUids: recipients.map((r) => r.uid),
      recipientCount: recipients.length,
      notifiedAt: FieldValue.serverTimestamp(),
    });
    await sendExpoPush(
      recipients.flatMap((r) => r.tokens),
      `Meeting: ${m.title}`,
      `${from} has called a meeting. ${prettyWhen(m)} · ${m.venue}. Tap to confirm you've seen it.`,
      tag,
      data,
    );
    return;
  }

  const uids = m.recipientUids ?? [];
  if (!uids.length) return;

  if (before.status !== "cancelled" && m.status === "cancelled") {
    await sendExpoPush(await tokensForUids(uids), `Cancelled: ${m.title}`, `${from} cancelled the meeting on ${prettyWhen(before)}.`, tag, data);
    return;
  }

  const moved = before.date !== m.date || before.startTime !== m.startTime ||
    (before.endTime ?? null) !== (m.endTime ?? null) || before.venue !== m.venue;
  if (m.status === "scheduled" && moved && (before.recipientUids ?? []).length) {
    await sendExpoPush(await tokensForUids(uids), `Meeting changed: ${m.title}`, `Now ${prettyWhen(m)} · ${m.venue}.`, tag, data);
  }
});
