import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {sendExpoPush} from "./expoPush";
import {studentsFor, tokensFor} from "./audience";

export const sendNoticePush = onDocumentCreated(
  "notices/{noticeId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const n = snap.data() as {
      title?: string;
      description?: string;
      targetBranch?: string | null;
      targetSection?: string | null;
      targetAdmissionYear?: number | null;
      targetSpecialization?: string | null;
    };
    if (!n.title) return;

    const {matched, total} = await studentsFor({
      branches: n.targetBranch ? [n.targetBranch] : [],
      sections: n.targetSection ? [n.targetSection] : [],
      admissionYears: n.targetAdmissionYear ? [n.targetAdmissionYear] : [],
      specialization: n.targetSpecialization ?? null,
    });
    const tokens = tokensFor(matched, "notices");
    // eslint-disable-next-line no-console
    console.log(`[sendNoticePush] ${event.params.noticeId}: ${matched.length}/${total} students match, ${tokens.length} device(s)`);
    await sendExpoPush(tokens, `New notice: ${n.title}`, n.description || "Tap to read it.", "sendNoticePush", {screen: "Notices"});
  },
);
