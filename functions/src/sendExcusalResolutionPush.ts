import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {tokensOf} from "./audience";

export const sendExcusalResolutionPush = onDocumentWritten(
  "eventExcusals/{excusalId}",
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!after?.exists) return;

    const beforeData = before?.exists ?
      (before.data() as {status?: string}) :
      undefined;
    const afterData = after.data() as {
      submittedBy: string;
      status: "pending" | "approved" | "rejected";
      eventName: string;
      facultyCoordinatorName: string;
      facultyRemark: string | null;
    };

    const wasPending = !beforeData || beforeData.status === "pending";
    const justResolved =
      wasPending && (afterData.status === "approved" || afterData.status === "rejected");
    if (!justResolved) return;

    const db = getFirestore();
    const coordinatorSnap = await db.collection("users").doc(afterData.submittedBy).get();
    const tokens = tokensOf(coordinatorSnap.data());
    if (!tokens.length) return;

    const verb = afterData.status === "approved" ? "approved" : "rejected";
    const body = afterData.facultyRemark ?
      `${afterData.facultyCoordinatorName} ${verb} the excusal for "${afterData.eventName}": "${afterData.facultyRemark}"` :
      `${afterData.facultyCoordinatorName} ${verb} the excusal request for "${afterData.eventName}".`;

    await sendExpoPush(tokens, afterData.status === "approved" ? "Excusal Approved" : "Excusal Rejected", body, "sendExcusalResolutionPush", {screen: "SubmitEventExcusal"});
  },
);
