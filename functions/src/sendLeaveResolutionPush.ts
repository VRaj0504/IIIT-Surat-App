import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {tokensOf} from "./audience";

export const sendLeaveResolutionPush = onDocumentWritten(
  "leaveApplications/{applicationId}",
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!after?.exists) return;

    const beforeData = before?.exists ?
      (before.data() as {status?: string}) :
      undefined;
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
    const tokens = tokensOf(studentSnap.data());
    if (!tokens.length) return;

    const verb = afterData.status === "approved" ? "approved" : "rejected";
    const leaveTypeLabel = "Casual";
    const body = afterData.facultyRemark ?
      `${afterData.facultyName} ${verb} your ${leaveTypeLabel} leave: "${afterData.facultyRemark}"` :
      `${afterData.facultyName} ${verb} your ${leaveTypeLabel} leave request.`;

    await sendExpoPush(tokens, afterData.status === "approved" ? "Leave Approved" : "Leave Rejected", body, "sendLeaveResolutionPush", {screen: "ApplyLeave"});
  },
);
