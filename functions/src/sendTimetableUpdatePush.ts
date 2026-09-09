import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";

// onDocumentWritten (not onDocumentCreated) so this fires for BOTH a
// brand-new timetable AND a correction/re-upload to an existing one —
// "the timetable changed, go check it" applies equally either way. This
// was missing entirely before: no trigger of any kind watched the
// timetable collection, so a corrected upload updated Firestore silently
// with nothing telling affected students.
//
// Scoped to students only, not faculty — matching every faculty member
// teaching a given timetable would need scanning every slot's initials
// through the same FACULTY_LEGEND duplicated in sendClassReminderPush.ts,
// and faculty are the ones doing the editing in the first place, so they
// already know it changed.
export const sendTimetableUpdatePush = onDocumentWritten(
  "timetable/{timetableId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return; // a delete — nothing to notify about
    const timetable = after.data() as {branch: string; semester: number; section: string};
    if (!timetable?.branch || !timetable?.semester || !timetable?.section) return;

    const db = getFirestore();
    const snapshot = await db
      .collection("users")
      .where("role", "==", "student")
      .where("branch", "==", timetable.branch)
      .where("section", "==", timetable.section)
      .get();

    const tokens: string[] = [];
    snapshot.docs.forEach((doc) => {
      const student = doc.data() as {
        admissionYear?: number;
        expoPushToken?: string;
        notificationPreferences?: {timetableUpdates?: boolean};
      };
      if (!student.expoPushToken) return;
      if (student.notificationPreferences?.timetableUpdates === false) return;
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
              title: "Timetable Updated",
              body: `${timetable.branch} Sem ${timetable.semester} Section ${timetable.section} — check what's changed.`,
              sound: "default",
              priority: "high",
            })),
          ),
        }).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[sendTimetableUpdatePush] Expo push API call failed:", err);
        }),
      ),
    );
  },
);
