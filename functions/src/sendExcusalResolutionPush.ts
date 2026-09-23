import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";

// Same pending -> approved/rejected transition guard as
// sendLeaveResolutionPush, and same reasoning for skipping the
// notificationPreferences gate.
//
// An excusal is submitted BY a student coordinator ON BEHALF OF a list of
// students (studentEnrollmentNumbers) — there's no single "requester uid"
// the way leaveApplications has, and enrollment numbers alone aren't
// enough to look up push tokens (see resolveRosterSection-style scoping
// elsewhere for why enrollment number isn't the same thing as a uid).
// submittedBy (the coordinator's own uid) is the one account that
// actually tracks this request end to end, so that's who gets pushed —
// matches the existing model where only the coordinator sees this in
// their own submission history, not each individual excused student.
export const sendExcusalResolutionPush = onDocumentWritten(
  "eventExcusals/{excusalId}",
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!after?.exists) return;

    const beforeData = before?.exists
      ? (before.data() as {status?: string})
      : undefined;
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
    const coordinator = coordinatorSnap.data() as {expoPushToken?: string} | undefined;
    if (!coordinator?.expoPushToken) return;

    const verb = afterData.status === "approved" ? "approved" : "rejected";
    const body = afterData.facultyRemark
      ? `${afterData.facultyCoordinatorName} ${verb} the excusal for "${afterData.eventName}": "${afterData.facultyRemark}"`
      : `${afterData.facultyCoordinatorName} ${verb} the excusal request for "${afterData.eventName}".`;

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          to: coordinator.expoPushToken,
          title: afterData.status === "approved" ? "Excusal Approved" : "Excusal Rejected",
          body,
          sound: "default",
          priority: "high",
        },
      ]),
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[sendExcusalResolutionPush] Expo push API call failed:", err);
    });
  },
);