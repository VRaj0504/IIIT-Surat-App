// functions/src/sendComplaintResolutionPush.ts
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";

// Same pending -> resolved/rejected transition guard as
// sendLeaveResolutionPush/sendExcusalResolutionPush, and the same
// reasoning for skipping the notificationPreferences gate — a student
// should never be able to silence "was my own complaint resolved".
export const sendComplaintResolutionPush = onDocumentWritten(
  "complaints/{complaintId}",
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!after?.exists) return;

    const beforeData = before?.exists
      ? (before.data() as {status?: string})
      : undefined;
    const afterData = after.data() as {
      studentUid: string;
      status: "pending" | "resolved" | "rejected";
      // Missing on docs written before `type` existed — treated as
      // "complaint" below, the original meaning of this collection.
      type?: "complaint" | "doubt";
      subject: string;
      resolvedByName: string | null;
      facultyRemark: string | null;
    };

    const wasPending = !beforeData || beforeData.status === "pending";
    const justResolved =
      wasPending && (afterData.status === "resolved" || afterData.status === "rejected");
    if (!justResolved) return;

    const db = getFirestore();
    const studentSnap = await db.collection("users").doc(afterData.studentUid).get();
    const student = studentSnap.data() as {expoPushToken?: string} | undefined;
    if (!student?.expoPushToken) return;

    const isDoubt = afterData.type === "doubt";
    const noun = isDoubt ? "doubt" : "complaint";
    const verb = afterData.status === "resolved" ? (isDoubt ? "answered" : "marked resolved") : (isDoubt ? "dismissed" : "rejected");
    const byName = afterData.resolvedByName ?? "Admin/faculty";
    const body = afterData.facultyRemark
      ? `${byName} ${verb} your ${noun} "${afterData.subject}": "${afterData.facultyRemark}"`
      : `${byName} ${verb} your ${noun} "${afterData.subject}".`;
    const title = afterData.status === "resolved"
      ? (isDoubt ? "Doubt Answered" : "Complaint Resolved")
      : (isDoubt ? "Doubt Dismissed" : "Complaint Rejected");

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          to: student.expoPushToken,
          title,
          body,
          sound: "default",
          priority: "high",
        },
      ]),
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[sendComplaintResolutionPush] Expo push API call failed:", err);
    });
  },
);