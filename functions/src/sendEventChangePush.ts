import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {tokensOf, wants, type UserDoc} from "./audience";

type Ev = {clubId?: string; clubName?: string; title?: string; venue?: string | null; dateTime?: Timestamp; reminderSent?: boolean};

const when = (t: Timestamp) =>
  t.toDate().toLocaleString("en-IN", {weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata"});

// Tells club followers when an upcoming event is moved, re-located or cancelled, and re-arms the 1-hour reminder after a move.
export const sendEventChangePush = onDocumentWritten("clubEvents/{eventId}", async (event) => {
  const before = event.data?.before?.exists ? (event.data.before.data() as Ev) : null;
  const after = event.data?.after?.exists ? (event.data.after.data() as Ev) : null;
  if (!before) return; // new events are handled by sendClubEventPush
  const now = Date.now();
  const e = after ?? before;
  if (!e.clubId) return;

  let title = "";
  let body = "";
  if (!after) {
    if (!before.dateTime || before.dateTime.toMillis() < now) return;
    title = `${before.title ?? "Event"} cancelled`;
    body = `${before.clubName ?? "Club"} · was on ${when(before.dateTime)}`;
  } else {
    const moved = !!before.dateTime && !!after.dateTime && !before.dateTime.isEqual(after.dateTime);
    const relocated = (before.venue ?? null) !== (after.venue ?? null) && !!after.venue;
    if (moved && after.reminderSent) await event.data!.after.ref.update({reminderSent: false});
    if (!after.dateTime || after.dateTime.toMillis() < now || (!moved && !relocated)) return;
    title = moved ? `${after.title ?? "Event"} moved` : `${after.title ?? "Event"}: new venue`;
    body = `${after.clubName ?? "Club"} · now ${when(after.dateTime)}${after.venue ? ` · ${after.venue}` : ""}`;
  }

  const followers = await getFirestore().collection("users").where("followedClubs", "array-contains", e.clubId).get();
  const tokens = new Set<string>();
  followers.docs.forEach((u) => {
    const user = u.data() as UserDoc;
    if (wants(user, "clubEvents")) tokensOf(user).forEach((t) => tokens.add(t));
  });
  if (!tokens.size) return;
  await sendExpoPush(Array.from(tokens), title, body, "sendEventChangePush", {screen: "ClubDetail", clubId: e.clubId, clubName: e.clubName ?? ""});
});
