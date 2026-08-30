import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";

// Fires whenever a new doc lands in `announcements` (see
// src/firebase/announcementsService.ts on the client — this mirrors that
// same file's exact matching logic, since the Admin SDK bypasses
// firestore.rules and reads every student directly). Finds everyone whose
// profile matches the announcement's target (branch/section/year/
// specialization, same "unset dimension = matches everyone" rule as the
// client-side filter) and sends them a real push via Expo's push service.
//
// Deliberately best-effort throughout: a student with no expoPushToken
// (hasn't opened a dev build yet, or is still on Expo Go) is silently
// skipped, never an error — push is a bonus on top of the in-app feed,
// which already works for everyone regardless of push setup.
export const sendAnnouncementPush = onDocumentCreated(
  "announcements/{announcementId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const announcement = snap.data() as {
      message: string;
      targetBranch: string;
      targetSection: string | null;
      targetAdmissionYear: number | null;
      targetSpecialization: string | null;
      createdByName: string;
    };

    const db = getFirestore();
    let query: FirebaseFirestore.Query = db.collection("users").where("role", "==", "student");
    if (announcement.targetBranch) {
      query = query.where("branch", "==", announcement.targetBranch);
    }
    // section/admissionYear/specialization are matched in-memory below
    // rather than chained onto the query, since Firestore only allows one
    // range/array field per composite without a matching index — doing it
    // this way needs no new composite index, same reasoning as everywhere
    // else in this app that targets a class.
    const snapshot = await query.get();

    const tokens: string[] = [];
    snapshot.docs.forEach((doc) => {
      const student = doc.data() as {
        section?: string;
        admissionYear?: number;
        specialization?: string;
        expoPushToken?: string;
      };
      if (!student.expoPushToken) return;
      if (announcement.targetSection && announcement.targetSection !== student.section) return;
      if (
        announcement.targetAdmissionYear &&
        announcement.targetAdmissionYear !== student.admissionYear
      ) {
        return;
      }
      if (
        announcement.targetSpecialization &&
        announcement.targetSpecialization !== student.specialization
      ) {
        return;
      }
      tokens.push(student.expoPushToken);
    });

    if (tokens.length === 0) return;

    // Expo's push API accepts up to 100 messages per request — chunk to
    // stay under that regardless of how big a class is.
    const CHUNK_SIZE = 100;
    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      chunks.push(tokens.slice(i, i + CHUNK_SIZE));
    }

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
              title: `Announcement from ${announcement.createdByName}`,
              body: announcement.message,
              sound: "default",
              priority: "high",
            })),
          ),
        }).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[sendAnnouncementPush] Expo push API call failed:", err);
        }),
      ),
    );
  },
);
