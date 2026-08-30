import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";

const METHOD_LABEL: Record<string, string> = {
  email: "emailed you",
  call: "is calling you",
  whatsapp: "messaged you on WhatsApp",
};

// Fires on every new doc in lostFoundContacts (written by
// notifyLostFoundContact in lostFoundService.ts the moment someone taps
// Email/Call/WhatsApp on a post) — pushes the poster an immediate
// notification instead of them having to notice a new email whenever
// they next happen to check it. Same best-effort shape as
// sendAnnouncementPush: a poster with no expoPushToken (Expo Go, or
// hasn't granted permission) is silently skipped, never an error — the
// mailto/tel/wa.me action the person actually tapped already fired
// client-side regardless of whether this push succeeds.
export const sendLostFoundContactPush = onDocumentCreated(
  "lostFoundContacts/{contactId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const contact = snap.data() as {
      itemTitle: string;
      posterUid: string;
      contactedByName: string;
      method: "email" | "call" | "whatsapp";
    };

    const db = getFirestore();
    const posterSnap = await db.collection("users").doc(contact.posterUid).get();
    const posterToken = (posterSnap.data() as { expoPushToken?: string } | undefined)?.expoPushToken;
    if (!posterToken) return;

    const actionLabel = METHOD_LABEL[contact.method] ?? "wants to talk to you";

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          to: posterToken,
          title: "Lost & Found",
          body: `${contact.contactedByName} ${actionLabel} about "${contact.itemTitle}"`,
          sound: "default",
          priority: "high",
        },
      ]),
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[sendLostFoundContactPush] Expo push API call failed:", err);
    });
  },
);
