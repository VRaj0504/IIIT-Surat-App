import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {sendExpoPush} from "./expoPush";
import {studentsFor, tokensFor} from "./audience";

export const sendClubEventPush = onDocumentCreated(
  "clubEvents/{eventId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const e = snap.data() as {clubName?: string; title?: string};
    if (!e.title) return;
    const {matched} = await studentsFor({});
    await sendExpoPush(tokensFor(matched, "clubEvents"), `${e.clubName || "Club"} event`, e.title, "sendClubEventPush", {screen: "Events"});
  },
);
