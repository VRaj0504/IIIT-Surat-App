import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {tokensOf} from "./audience";

const METHOD_LABEL: Record<string, string> = {
  email: "emailed you",
  call: "is calling you",
  whatsapp: "messaged you on WhatsApp",
};

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
    const tokens = tokensOf(posterSnap.data());
    if (!tokens.length) return;

    const actionLabel = METHOD_LABEL[contact.method] ?? "wants to talk to you";

    await sendExpoPush(tokens, "Lost & Found", `${contact.contactedByName} ${actionLabel} about "${contact.itemTitle}"`, "sendLostFoundContactPush", {screen: "LostFound"});
  },
);
