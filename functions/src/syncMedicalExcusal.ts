import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";

type Leave = {
  type?: string;
  stage?: string;
  studentUid?: string;
  studentName?: string;
  studentEnrollmentNumber?: string | null;
  fromDate?: string;
  toDate?: string;
  excusedSessions?: string[];
  excuseAllDates?: boolean;
};

export const syncMedicalExcusal = onDocumentWritten("leaveApplications/{leaveId}", async (event) => {
  const db = getFirestore();
  const out = db.collection("medicalExcusals").doc(event.params.leaveId);
  const after = event.data?.after?.exists ? (event.data.after.data() as Leave) : null;

  const allDates = !!after?.excuseAllDates && (after.stage === "done" || after.stage === "teachers");
  const sessions = after?.excusedSessions ?? [];
  if (!after || after.type !== "medical" || after.stage === "rejected" || (!allDates && sessions.length === 0)) {
    await out.delete().catch(() => undefined);
    return;
  }

  const current = await out.get();
  const next = {
    studentUid: after.studentUid ?? null,
    studentName: after.studentName ?? null,
    enrollmentNumber: after.studentEnrollmentNumber ?? null,
    fromDate: after.fromDate ?? null,
    toDate: after.toDate ?? null,
    sessions: Array.from(new Set(sessions)).sort(),
    allDates,
  };
  if (current.exists && JSON.stringify(current.data()) === JSON.stringify(next)) return;
  await out.set(next);
});
