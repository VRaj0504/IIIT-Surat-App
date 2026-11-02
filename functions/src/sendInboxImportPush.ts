import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {tokensOf} from "./audience";

export const sendInboxImportPush = onDocumentCreated(
  "pendingImports/{importId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const pendingImport = snap.data() as {
      subject: string;
      fromName: string;
      contentType: "resource" | "timetable" | "notice" | "unclear";
    };

    const db = getFirestore();
    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();

    const tokens: string[] = [];
    adminsSnap.docs.forEach((doc) => tokens.push(...tokensOf(doc.data())));

    if (tokens.length === 0) return;

    await sendExpoPush(tokens, "New email needs review", `From ${pendingImport.fromName}: "${pendingImport.subject}" (${pendingImport.contentType})`, "sendInboxImportPush");
  },
);
