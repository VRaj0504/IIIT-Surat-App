import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {sendSms, smsKey} from "./sms";

type Sos = {
  studentUid: string;
  studentName: string;
  enrollmentNumber?: string | null;
  branch?: string | null;
  section?: string | null;
  type: "medical" | "safety" | "other";
  note?: string;
  status: string;
  ackBy?: {name: string} | null;
  resolvedBy?: {name: string} | null;
};

const TYPE_LABEL: Record<string, string> = {medical: "Medical", safety: "Safety", other: "Emergency"};

async function tokensForEmails(emails: string[]): Promise<string[]> {
  const db = getFirestore();
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

export const sendSosPush = onDocumentWritten({document: "sosAlerts/{alertId}", secrets: [smsKey]}, async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const sos = after.data() as Sos;
  const before = event.data?.before?.exists ? (event.data.before.data() as Sos) : null;
  const db = getFirestore();
  const tag = "sendSosPush";

  const reviewer = (await db.collection("users").doc(sos.studentUid).get()).data()?.reviewer === true;
  if (reviewer) {
    if (!before) await after.ref.update({smsSent: 0, smsError: "Demo account — no alerts sent", demo: true}).catch(() => {});
    console.log(`[${tag}] demo SOS from reviewer account, not notifying anyone`);
    return;
  }

  if (!before) {
    const cfg = (await db.collection("config").doc("sos").get()).data() as
      {responderEmails?: string[]; smsNumbers?: string[]} | undefined;
    const student = (await db.collection("users").doc(sos.studentUid).get()).data() as
      {emergencyContacts?: {phone: string}[]} | undefined;
    const responderTokens = await tokensForEmails(cfg?.responderEmails ?? []);
    const admins = await db.collection("users").where("role", "==", "admin").get();
    const adminTokens = admins.docs.map((d) => (d.data() as {expoPushToken?: string}).expoPushToken).filter(Boolean) as string[];
    const who = [sos.studentName, sos.enrollmentNumber, [sos.branch, sos.section].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(" · ");

    const loc = (after.data() as {location?: {lat: number; lng: number} | null}).location;
    const phone = (after.data() as {phone?: string | null}).phone;
    const smsText =
      `SOS (${TYPE_LABEL[sos.type] ?? "Emergency"}) from ${sos.studentName}` +
      `${sos.enrollmentNumber ? `, ${sos.enrollmentNumber}` : ""}${sos.section ? `, ${sos.section}` : ""}, IIIT Surat.` +
      `${sos.note ? ` "${sos.note.slice(0, 60)}".` : ""}` +
      `${loc ? ` Location: https://maps.google.com/?q=${loc.lat},${loc.lng}` : " Location not shared."}` +
      `${phone ? ` Call: ${phone}` : ""}`;
    const personal = (student?.emergencyContacts ?? []).map((c) => c.phone);
    const sms = await sendSms([...(cfg?.smsNumbers ?? []), ...personal], smsText, tag);
    await after.ref.update({smsSent: sms.sent, smsError: sms.error ?? null}).catch(() => {});

    await sendExpoPush(
      Array.from(new Set([...responderTokens, ...adminTokens])),
      `🚨 SOS — ${TYPE_LABEL[sos.type] ?? "Emergency"}: ${sos.studentName}`,
      `${who}${sos.note ? ` — "${sos.note.slice(0, 80)}"` : ""}. ` +
        (loc ? "Location shared — tap to open the map and call." : "No location — tap to call."),
      tag,
      {screen: "SosAlerts", sosId: event.params.alertId},
      "sos",
    );
    return;
  }

  if (before.status === sos.status) return;
  const student = (await db.collection("users").doc(sos.studentUid).get()).data() as {expoPushToken?: string} | undefined;
  if (!student?.expoPushToken) return;
  if (sos.status === "acknowledged") {
    await sendExpoPush(
      [student.expoPushToken],
      "Help is on the way",
      `${sos.ackBy?.name ?? "A responder"} has seen your SOS and is coming. Stay where you are if it's safe.`,
      tag,
    );
  } else if (sos.status === "resolved") {
    await sendExpoPush(
      [student.expoPushToken],
      "SOS closed",
      `${sos.resolvedBy?.name ?? "A responder"} marked your SOS as resolved. Press SOS again if you still need help.`,
      tag,
    );
  }
});
