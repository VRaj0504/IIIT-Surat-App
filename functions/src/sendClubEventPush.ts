import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";

// clubEvents has no branch/section/semester targeting at all (see
// clubsService.ts's createEvent — any club's events are visible to
// every student browsing Clubs), so unlike notices/resources/
// announcements this one has nothing to filter by beyond "is a student
// with a token" — it's inherently whole-college by design.
export const sendClubEventPush = onDocumentCreated(
  "clubEvents/{eventId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const clubEvent = snap.data() as {clubName: string; title: string};

    const db = getFirestore();
    const snapshot = await db.collection("users").where("role", "==", "student").get();

    const tokens: string[] = [];
    snapshot.docs.forEach((doc) => {
      const student = doc.data() as {
        expoPushToken?: string;
        notificationPreferences?: {clubEvents?: boolean};
      };
      if (!student.expoPushToken) return;
      if (student.notificationPreferences?.clubEvents === false) return;
      tokens.push(student.expoPushToken);
    });

    if (tokens.length === 0) return;

    const CHUNK_SIZE = 100;
    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) chunks.push(tokens.slice(i, i + CHUNK_SIZE));

    await Promise.all(
      chunks.map((chunk) =>
        fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            chunk.map((token) => ({
              to: token,
              title: `New Event: ${clubEvent.clubName}`,
              body: clubEvent.title,
              sound: "default",
              priority: "high",
            })),
          ),
        }).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[sendClubEventPush] Expo push API call failed:", err);
        }),
      ),
    );
  },
);
