import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";

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
    adminsSnap.docs.forEach((doc) => {
      const admin = doc.data() as {expoPushToken?: string};
      if (admin.expoPushToken) tokens.push(admin.expoPushToken);
    });

    if (tokens.length === 0) return;

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        tokens.map((token) => ({
          to: token,
          title: "New email needs review",
          body: `From ${pendingImport.fromName}: "${pendingImport.subject}" (${pendingImport.contentType})`,
          sound: "default",
          priority: "high",
        })),
      ),
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[sendInboxImportPush] Expo push API call failed:", err);
    });
  },
);