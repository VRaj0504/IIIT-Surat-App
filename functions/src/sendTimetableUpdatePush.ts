import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {sendExpoPush} from "./expoPush";
import {studentsFor, tokensFor} from "./audience";

const IGNORE = new Set(["updatedAt", "updatedBy", "updatedByEmail", "createdAt"]);
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    if (typeof (v as {toMillis?: unknown}).toMillis === "function") return "";
    return `{${Object.keys(v as object).filter((k) => !IGNORE.has(k)).sort().map((k) => `${k}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

type TT = {branch?: string; semester?: number; section?: string; slots?: unknown; days?: unknown; schedule?: unknown};

export const sendTimetableUpdatePush = onDocumentWritten(
  "timetable/{timetableId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const t = after.data() as TT;
    if (!t?.branch || !t?.semester) return;
    const before = event.data?.before?.exists ? (event.data.before.data() as TT) : null;
    if (before && stable(before) === stable(t)) return;

    const {matched} = await studentsFor({
      branches: t.branch.toUpperCase() === "CSE" ? ["CSE", "MNC"] : [t.branch],
      sections: t.section ? [t.section] : [],
      semester: Number(t.semester),
    });
    const tokens = tokensFor(matched, "timetableUpdates");
    await sendExpoPush(
      tokens,
      before ? "Timetable updated" : "Timetable published",
      `${t.branch} Sem ${t.semester}${t.section ? ` ${t.section}` : ""} — check what's changed.`,
      "sendTimetableUpdatePush",
      {screen: "Timetable"},
    );
  },
);
