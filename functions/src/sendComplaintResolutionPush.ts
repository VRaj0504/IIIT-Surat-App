
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {tokensOf} from "./audience";

export const sendComplaintResolutionPush = onDocumentWritten(
  "complaints/{complaintId}",
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!after?.exists) return;

    const beforeData = before?.exists ?
      (before.data() as {status?: string}) :
      undefined;
    const afterData = after.data() as {
      studentUid: string;
      status: "pending" | "resolved" | "rejected";

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
    const tokens = tokensOf(studentSnap.data());
    if (!tokens.length) return;

    const isDoubt = afterData.type === "doubt";
    const noun = isDoubt ? "doubt" : "complaint";
    const verb = afterData.status === "resolved" ? (isDoubt ? "answered" : "marked resolved") : (isDoubt ? "dismissed" : "rejected");
    const byName = afterData.resolvedByName ?? "Admin/faculty";
    const body = afterData.facultyRemark ?
      `${byName} ${verb} your ${noun} "${afterData.subject}": "${afterData.facultyRemark}"` :
      `${byName} ${verb} your ${noun} "${afterData.subject}".`;
    const title = afterData.status === "resolved" ?
      (isDoubt ? "Doubt Answered" : "Complaint Resolved") :
      (isDoubt ? "Doubt Dismissed" : "Complaint Rejected");

    await sendExpoPush(tokens, title, body, "sendComplaintResolutionPush", {screen: "Complaints"});
  },
);
