import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {sendExpoPush} from "./expoPush";
import {studentsFor, tokensFor} from "./audience";

export const sendResourcePush = onDocumentCreated(
  "resources/{resourceId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const r = snap.data() as {title?: string; subject?: string; branch?: string; semester?: number};
    if (!r.branch || !r.semester) return;

    const {matched} = await studentsFor({branches: [r.branch], semester: Number(r.semester)});
    const tokens = tokensFor(matched, "resources");
    await sendExpoPush(tokens, "New resource uploaded", `${r.subject ?? ""}${r.subject ? ": " : ""}${r.title ?? ""}`, "sendResourcePush", {screen: "Resources"});
  },
);
