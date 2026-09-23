import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";

// Fires only on the actual pending -> approved/rejected transition, not on
// every write to a leaveApplications doc — resolveLeaveApplication()
// (leaveService.ts) is the only thing that ever changes `status`, but a
// document write could in principle touch this doc for other reasons
// later, and re-pushing "your leave was approved" on an unrelated edit
// would be a real annoyance, not just a redundant push.
//
// This is a single targeted push to the one student whose own request
// this is (studentUid), unlike the class-wide fan-outs elsewhere in this
// folder — there's no notificationPreferences gate here on purpose: a
// student should never be able to silence "did my own leave get
// approved", the way they reasonably can for a broadcast category like
// Announcements or Club Events.
export const sendLeaveResolutionPush = onDocumentWritten(
  "leaveApplications/{applicationId}",
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!after?.exists) return; // a delete — nothing to notify about

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

    const db = getFirestore();
    const studentSnap = await db.collection("users").doc(afterData.studentUid).get();
    const student = studentSnap.data() as {expoPushToken?: string} | undefined;
    if (!student?.expoPushToken) return;

    const verb = afterData.status === "approved" ? "approved" : "rejected";
    const leaveTypeLabel = afterData.type === "medical" ? "Medical" : "Casual";
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