import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {sendExpoPush} from "./expoPush";
import {studentsFor, tokensFor} from "./audience";

type Change = {
  date?: string;
  branch?: string;
  semester?: number;
  section?: string | null;
  subjectCode?: string;
  subjectName?: string;
  startTime?: string;
  type?: "cancelled" | "room";
  oldRoom?: string | null;
  newRoom?: string | null;
  facultyName?: string;
};

function to12h(t: string): string {
  const m = /^(\d{1,2})[:.](\d{2})/.exec(t.trim());
  if (!m) return t;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const today = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return new Date(target).toLocaleDateString("en-IN", {weekday: "short", day: "numeric", month: "short", timeZone: "UTC"});
}

export const sendClassChangePush = onDocumentWritten(
  "classChanges/{changeId}",
  async (event) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as Change) : null;
    const after = event.data?.after?.exists ? (event.data.after.data() as Change) : null;
    const c = after ?? before;
    if (!c?.branch || !c?.semester || !c?.date) return;
    if (after && before && after.type === before.type && (after.newRoom ?? null) === (before.newRoom ?? null)) return;

    const subject = c.subjectName || c.subjectCode || "Class";
    const when = `${dayLabel(c.date)}${c.startTime ? ` at ${to12h(c.startTime)}` : ""}`;
    let title: string;
    let body: string;
    if (!after) {
      title = `${subject} is back on`;
      body = `The change for ${when} was undone. Class runs as per the timetable.`;
    } else if (after.type === "cancelled") {
      title = `${subject} cancelled`;
      body = `No class ${when}.${after.facultyName ? ` · ${after.facultyName}` : ""}`;
    } else {
      title = `${subject}: room changed`;
      body = `${when}: now in ${after.newRoom}${after.oldRoom ? ` (not ${after.oldRoom})` : ""}.`;
    }

    const {matched} = await studentsFor({
      branches: c.branch.toUpperCase() === "CSE" ? ["CSE", "MNC"] : [c.branch],
      sections: c.section ? [c.section] : [],
      semester: Number(c.semester),
    });
    await sendExpoPush(tokensFor(matched, "timetableUpdates"), title, body, "sendClassChangePush", {screen: "Timetable"});
  },
);
