import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";

// One push to the one student a grade belongs to, the moment faculty
// saves it (web portal's Assign Grades, or the in-app GradeEntry screen).
// Grades are keyed by enrollment number, not uid — a grade can be saved
// before the student has ever signed in — so the student is found by
// enrollmentNumber on their users doc; a student who hasn't signed up
// yet simply has no token, and sees the grade in Transcript whenever
// they do.
//
// The push deliberately names the SUBJECT but not the GRADE itself: a
// lock screen is visible to whoever is standing next to the phone.
//
// Fires only for a new grade or a CHANGED one — re-saving a whole class's
// marksheet with unchanged cutoffs rewrites every doc, and shouldn't
// re-notify anyone whose grade didn't move.
export const sendGradePush = onDocumentWritten(
  "grades/{gradeId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const before = event.data?.before;
    const grade = after.data() as {
      studentEnrollmentNumber?: string;
      subjectName?: string;
      subjectCode?: string;
      grade?: string;
    };
    if (!grade?.studentEnrollmentNumber) return;

    const isUpdate = !!before?.exists;
    if (isUpdate && before?.data()?.grade === grade.grade) return;

    const snapshot = await getFirestore()
      .collection("users")
      .where("enrollmentNumber", "==", grade.studentEnrollmentNumber)
      .limit(1)
      .get();
    if (snapshot.empty) return;

    const student = snapshot.docs[0].data() as {
      expoPushToken?: string;
      notificationPreferences?: {examsAndGrades?: boolean};
    };
    if (!student.expoPushToken) return;
    if (student.notificationPreferences?.examsAndGrades === false) return;

    await sendExpoPush(
      [student.expoPushToken],
      isUpdate ? "Grade updated" : "New grade posted",
      `${grade.subjectName ?? grade.subjectCode ?? "A subject"} — open Transcript to see it.`,
      "sendGradePush",
    );
  },
);
