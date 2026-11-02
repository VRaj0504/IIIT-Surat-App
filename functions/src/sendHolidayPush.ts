import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {tokensOf, type UserDoc} from "./audience";

function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {weekday: "short", day: "numeric", month: "short", timeZone: "UTC"});
}

export const sendHolidayPush = onDocumentWritten("holidayOverrides/{date}", async (event) => {
  const date = String(event.params.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < istToday()) return;
  const before = event.data?.before?.exists ? (event.data.before.data() as {name?: string}) : null;
  const after = event.data?.after?.exists ? (event.data.after.data() as {name?: string}) : null;
  if (before && after && (before.name ?? "") === (after.name ?? "")) return;

  const snap = await getFirestore().collection("users").where("role", "in", ["student", "faculty"]).get();
  const tokens = snap.docs.flatMap((d) => {
    const u = d.data() as UserDoc;
    return u.reviewer === true ? [] : tokensOf(u);
  });

  if (after) {
    await sendExpoPush(tokens, `Holiday on ${pretty(date)}`, `${after.name || "Holiday"} — no classes that day.`, "sendHolidayPush", {screen: "AcademicCalendar"});
  } else {
    await sendExpoPush(tokens, `Holiday cancelled: ${pretty(date)}`, `${before?.name || "The holiday"} is cancelled — classes run as usual.`, "sendHolidayPush", {screen: "AcademicCalendar"});
  }
});
