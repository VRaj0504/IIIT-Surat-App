import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {tokensByEnrollment} from "./audience";
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
      published?: boolean;
    };
    if (!grade?.studentEnrollmentNumber) return;

    const prev = before?.exists ? (before.data() as {grade?: string; published?: boolean}) : null;
    let published = grade.published;
    let isUpdate: boolean;
    if (typeof published !== "boolean") {
      const cfg = (await getFirestore().collection("config").doc("exams").get()).data() as {publishMode?: string} | undefined;
      published = cfg?.publishMode !== "examCell";
      await after.ref.update({published});
      if (!published || (prev && prev.grade === grade.grade)) return;
      isUpdate = !!prev;
    } else {
      if (!published) return;
      if (prev && typeof prev.published !== "boolean" && prev.grade === grade.grade) return;
      const newlyPublished = !prev || prev.published === false;
      if (!newlyPublished && prev?.grade === grade.grade) return;
      isUpdate = !newlyPublished;
    }

    const tokens = await tokensByEnrollment(String(grade.studentEnrollmentNumber ?? ""), "examsAndGrades");
    if (!tokens.length) return;

    await sendExpoPush(
      tokens,
      isUpdate ? "Grade updated" : "New grade posted",
      `${grade.subjectName ?? grade.subjectCode ?? "A subject"} — open Transcript to see it.`,
      "sendGradePush",
      {screen: "Transcript"},
    );
  },
);
