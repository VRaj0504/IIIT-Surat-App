import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";

// Mirrors sendAnnouncementPush.ts's exact targeting logic, applied to the
// `notices` collection instead of `announcements` — these are two
// genuinely separate features in this app (see src/firebase/noticesService.ts
// vs announcementsService.ts), so each needs its own trigger; notices had
// no push at all before this, only the in-app feed.
export const sendNoticePush = onDocumentCreated(
  "notices/{noticeId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const notice = snap.data() as {
      title: string;
      description: string;
      targetBranch: string | null;
      targetSection: string | null;
      targetAdmissionYear: number | null;
      targetSpecialization: string | null;
    };

    const db = getFirestore();
    let query: FirebaseFirestore.Query = db.collection("users").where("role", "==", "student");
    if (notice.targetBranch) {
      query = query.where("branch", "==", notice.targetBranch);
    }
    const snapshot = await query.get();

    const tokens: string[] = [];
    snapshot.docs.forEach((doc) => {
      const student = doc.data() as {
        section?: string;
        admissionYear?: number;
        specialization?: string;
        expoPushToken?: string;
        notificationPreferences?: {notices?: boolean};
      };
      if (!student.expoPushToken) return;
      // Absence of the preferences map (or the notices key) means "on" —
      // same opt-out-not-opt-in default as the settings screen itself.
      if (student.notificationPreferences?.notices === false) return;
      if (notice.targetSection && notice.targetSection !== student.section) return;
      if (notice.targetAdmissionYear && notice.targetAdmissionYear !== student.admissionYear) return;
      if (notice.targetSpecialization && notice.targetSpecialization !== student.specialization) return;
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
              title: `New Notice: ${notice.title}`,
              body: notice.description,
              sound: "default",
              priority: "high",
            })),
          ),
        }).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[sendNoticePush] Expo push API call failed:", err);
        }),
      ),
    );
  },
);
