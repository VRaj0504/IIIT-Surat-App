import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";

export const sendLeaveResolutionPush = onDocumentWritten(
  "leaveApplications/{applicationId}",
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!after?.exists) return;

    const beforeData = before?.exists
      ? (before.data() as {status?: string})
      : undefined;
    const afterData = after.data() as {
      studentUid: string;
      status: "pending" | "approved" | "rejected";
      type: "medical" | "casual";
      facultyName: string;
      facultyRemark: string | null;
    };

    const wasPending = !beforeData || beforeData.status === "pending";
    const justResolved =
      wasPending && (afterData.status === "approved" || afterData.status === "rejected");
    if (!justResolved) return;

    if (afterData.type === "medical") return;

    const db = getFirestore();
    const studentSnap = await db.collection("users").doc(afterData.studentUid).get();
    const student = studentSnap.data() as {expoPushToken?: string} | undefined;
    if (!student?.expoPushToken) return;

    const verb = afterData.status === "approved" ? "approved" : "rejected";
    const leaveTypeLabel = "Casual";
    const body = afterData.facultyRemark
      ? `${afterData.facultyName} ${verb} your ${leaveTypeLabel} leave: "${afterData.facultyRemark}"`
      : `${afterData.facultyName} ${verb} your ${leaveTypeLabel} leave request.`;

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
          title: afterData.status === "approved" ? "Leave Approved" : "Leave Rejected",
          body,
          sound: "default",
          priority: "high",
        },
      ]),
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[sendLeaveResolutionPush] Expo push API call failed:", err);
    });
  },
);