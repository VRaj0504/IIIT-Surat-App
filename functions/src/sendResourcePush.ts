import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";

function getCurrentSemester(admissionYear: number, today: Date): number {
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const isOddSemesterPeriod = currentMonth >= 7;
  const academicYearIndex = isOddSemesterPeriod
    ? currentYear - admissionYear
    : currentYear - admissionYear - 1;
  return academicYearIndex * 2 + 1 + (isOddSemesterPeriod ? 0 : 1);
}

export const sendResourcePush = onDocumentCreated(
  "resources/{resourceId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const resource = snap.data() as {
      title: string;
      subject: string;
      branch: string;
      semester: number;
    };

    const db = getFirestore();
    const snapshot = await db
      .collection("users")
      .where("role", "==", "student")
      .where("branch", "==", resource.branch)
      .get();

    const today = new Date();
    const tokens: string[] = [];
    snapshot.docs.forEach((doc) => {
      const student = doc.data() as {
        admissionYear?: number;
        expoPushToken?: string;
        notificationPreferences?: {resources?: boolean};
      };
      if (!student.expoPushToken || !student.admissionYear) return;
      if (student.notificationPreferences?.resources === false) return;
      if (getCurrentSemester(student.admissionYear, today) !== resource.semester) return;
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
              title: "New Resource Uploaded",
              body: `${resource.subject}: ${resource.title}`,
              sound: "default",
              priority: "high",
            })),
          ),
        }).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[sendResourcePush] Expo push API call failed:", err);
        }),
      ),
    );
  },
);
