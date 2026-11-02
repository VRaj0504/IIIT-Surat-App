import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";

type Session = {
  branch: string;
  admissionYear: number;
  section: string | null;
  subjectCode: string;
  subjectName: string;
  date: string;
  absentEnrollmentNumbers?: string[];
  excusedEnrollmentNumbers?: string[];
  onlyEnrollmentNumbers?: string[];
  lecture?: number;
  semester?: number;
  specialization?: string | null;
  hours?: number;
  kind?: "lecture" | "lab";
};

export const getMyAttendanceSessions = onCall({region: "asia-south1"}, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const db = getFirestore();
  const me = (await db.collection("users").doc(uid).get()).data() as
    {enrollmentNumber?: string; branch?: string; admissionYear?: number; section?: string | null} | undefined;
  if (!me?.enrollmentNumber || !me.branch || !me.admissionYear) {
    throw new HttpsError("failed-precondition", "Your profile has no class details yet.");
  }
  const reg = me.enrollmentNumber;
  const snap = await db.collection("attendanceSessions")
    .where("branch", "==", me.branch)
    .where("admissionYear", "==", me.admissionYear)
    .where("section", "==", me.section ?? null)
    .get();

  const sessions = snap.docs
    .map((d) => d.data() as Session)
    .filter((d) => !d.onlyEnrollmentNumbers?.length || d.onlyEnrollmentNumbers.includes(reg))
    .map((d) => ({
      branch: d.branch,
      admissionYear: d.admissionYear,
      section: d.section ?? null,
      subjectCode: d.subjectCode,
      subjectName: d.subjectName,
      date: d.date,
      lecture: d.lecture ?? null,
      semester: d.semester ?? null,
      specialization: d.specialization ?? null,
      hours: d.hours ?? null,
      kind: d.kind ?? null,
      absent: (d.absentEnrollmentNumbers ?? []).includes(reg),
      excused: (d.excusedEnrollmentNumbers ?? []).includes(reg),
    }));
  return {sessions};
});
