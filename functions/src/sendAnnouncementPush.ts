import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {sendExpoPush} from "./expoPush";
import {studentsFor, tokensFor} from "./audience";

export const sendAnnouncementPush = onDocumentCreated(
  "announcements/{announcementId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const a = snap.data() as {
      message?: string;
      targetBranch?: string | null;
      targetSection?: string | null;
      targetAdmissionYear?: number | null;
      targetSpecialization?: string | null;
      createdByName?: string;
    };
    if (!a.message) return;

    const {matched, total} = await studentsFor({
      branches: a.targetBranch ? [a.targetBranch] : [],
      sections: a.targetSection ? [a.targetSection] : [],
      admissionYears: a.targetAdmissionYear ? [a.targetAdmissionYear] : [],
      specialization: a.targetSpecialization ?? null,
    });
    const tokens = tokensFor(matched, "announcements");
    // eslint-disable-next-line no-console
    console.log(
      `[sendAnnouncementPush] ${event.params.announcementId}: ${matched.length}/${total} students match ` +
      `${[a.targetBranch, a.targetSection, a.targetAdmissionYear].filter(Boolean).join(" ")}, ${tokens.length} device(s)`,
    );
    await sendExpoPush(tokens, `Announcement from ${a.createdByName || "Faculty"}`, a.message, "sendAnnouncementPush", {screen: "Announcements"});
  },
);
