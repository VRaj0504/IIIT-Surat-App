import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {studentsFor, tokensFor} from "./audience";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";

type Sheet = {
  branch: string;
  semester: number;
  examType?: string;
  examTypeLabel?: string;
  entries?: {subjectCode?: string}[];
  sourcePdfUrl?: string | null;
  takers?: Record<string, string[]> | null;
  students?: string[] | null;
};

const LABELS: Record<string, string> = {
  "midsem-repeaters": "Make-up (Mid Sem)",
  "endsem-repeaters": "Repeaters (End Sem)",
  "supplementary": "Supplementary exam",
};

export const sendExamSchedulePush = onDocumentWritten(
  "examSchedules/{docId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const before = event.data?.before;
    const schedule = after.data() as Sheet;
    if (!schedule?.branch || !schedule?.semester) return;

    const isUpdate = !!before?.exists;
    const prev = before?.data() as Sheet | undefined;
    if (
      isUpdate &&
      JSON.stringify(prev?.entries) === JSON.stringify(schedule.entries) &&
      (prev?.sourcePdfUrl ?? null) === (schedule.sourcePdfUrl ?? null) &&
      JSON.stringify(prev?.takers ?? {}) === JSON.stringify(schedule.takers ?? {})
    ) return;

    const type = schedule.examType ?? String(event.params.docId).split("-").slice(2).join("-");
    const label = LABELS[type] ?? schedule.examTypeLabel ?? "Exam";
    const listed = (schedule.students ?? []).map((r) => String(r).toUpperCase());

    if (listed.length) {
      const was = new Set((prev?.students ?? []).map((r) => String(r).toUpperCase()));
      const {matched} = await studentsFor({});
      const mine = new Set(listed);
      const fresh = matched.filter((m) => mine.has(String(m.user.enrollmentNumber ?? "").toUpperCase()));
      const newly = fresh.filter((m) => !was.has(String(m.user.enrollmentNumber ?? "").toUpperCase()));
      const entriesChanged = JSON.stringify(prev?.entries) !== JSON.stringify(schedule.entries);
      const targets = isUpdate && !entriesChanged ? newly : fresh;
      const tokens = tokensFor(targets, "examsAndGrades");
      await sendExpoPush(
        tokens,
        `${label} date sheet ${isUpdate && entriesChanged ? "updated" : "published"}`,
        "You're listed for this exam. Open Exam Schedule to see your subjects and dates.",
        "sendExamSchedulePush",
        {screen: "ExamSchedule"},
      );
      return;
    }

    let branches = [schedule.branch];
    if (schedule.branch === "CSE") {
      const own = await getFirestore()
        .collection("examSchedules")
        .doc(`MNC-${schedule.semester}-${type}`)
        .get();
      branches = own.exists ? ["CSE"] : ["CSE", "MNC"];
    }

    const {matched} = await studentsFor({branches, semester: Number(schedule.semester)});
    const tokens = tokensFor(matched, "examsAndGrades");
    const special = type.endsWith("-repeaters") || type === "supplementary";

    await sendExpoPush(
      tokens,
      `${label} date sheet ${isUpdate ? "updated" : "published"}`,
      special ?
        `${schedule.branch} Semester ${schedule.semester} — only for students taking this exam. Check the dates.` :
        `${schedule.branch} Semester ${schedule.semester} — check your exam dates.`,
      "sendExamSchedulePush",
      {screen: "ExamSchedule"},
    );
  },
);
