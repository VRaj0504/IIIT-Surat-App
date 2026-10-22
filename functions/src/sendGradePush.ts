import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";

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
