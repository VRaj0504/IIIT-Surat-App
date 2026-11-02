import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {studentsFor, tokensFor} from "./audience";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";

export const sendExamSchedulePush = onDocumentWritten(
  "examSchedules/{docId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const before = event.data?.before;
    const schedule = after.data() as {
      branch: string;
      semester: number;
      examType?: string;
      examTypeLabel?: string;
      entries?: unknown[];
    };
    if (!schedule?.branch || !schedule?.semester) return;

    if (String(event.params.docId).endsWith("-repeaters")) return;

    const isUpdate = !!before?.exists;

    const prev = before?.data() as {entries?: unknown[]; sourcePdfUrl?: string | null} | undefined;
    const next = after.data() as {sourcePdfUrl?: string | null};
    if (
      isUpdate &&
      JSON.stringify(prev?.entries) === JSON.stringify(schedule.entries) &&
      (prev?.sourcePdfUrl ?? null) === (next.sourcePdfUrl ?? null)
    ) return;

    let branches = [schedule.branch];
    if (schedule.branch === "CSE") {
      const own = await getFirestore()
        .collection("examSchedules")
        .doc(`MNC-${schedule.semester}-${schedule.examType ?? event.params.docId.split("-").slice(2).join("-")}`)
        .get();
      branches = own.exists ? ["CSE"] : ["CSE", "MNC"];
    }

    const {matched} = await studentsFor({branches, semester: Number(schedule.semester)});
    const tokens = tokensFor(matched, "examsAndGrades");

    const label = schedule.examTypeLabel ?? "Exam";
    await sendExpoPush(
      tokens,
      `${label} date sheet ${isUpdate ? "updated" : "published"}`,
      `${schedule.branch} Semester ${schedule.semester} — check your exam dates.`,
      "sendExamSchedulePush",
      {screen: "ExamSchedule"},
    );
  },
);
