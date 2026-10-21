import * as admin from "firebase-admin";
admin.initializeApp();


export {sendAnnouncementPush} from "./sendAnnouncementPush";
export {sendLostFoundContactPush} from "./sendLostFoundContactPush";
export {extractPosterInfo} from "./extractPosterInfo";
export {extractTimetableInfo} from "./extractTimetableInfo";
export {ingestFacultyEmail} from "./ingestFacultyEmail";
export {sendClassReminderPush} from "./sendClassReminderPush";
export {sendInboxImportPush} from "./sendInboxImportPush";

export {sendNoticePush} from "./sendNoticePush";
export {sendResourcePush} from "./sendResourcePush";

export {sendTimetableUpdatePush} from "./sendTimetableUpdatePush";
export {sendClubEventPush} from "./sendClubEventPush";
export {sendLeaveResolutionPush} from "./sendLeaveResolutionPush";
export {medicalLeaveWorkflow, medicalLeaveTeacherConfirmed} from "./medicalLeaveWorkflow";
export {sendExcusalResolutionPush} from "./sendExcusalResolutionPush";
export {sendComplaintResolutionPush} from "./sendComplaintResolutionPush";

export {sendExamSchedulePush} from "./sendExamSchedulePush";
export {sendGradePush} from "./sendGradePush";
export {extractExamSchedule} from "./extractExamSchedule";

export {sendDayStatusPush} from "./sendDayStatusPush";

export {syncRoleClaim} from "./syncRoleClaim";
export {backfillRoleClaims} from "./backfillRoleClaims";

export {sendCounsellingRequestPush} from "./sendCounsellingRequestPush";

export {cleanupResolvedDoubts} from "./cleanupResolvedDoubts";
export {sendSosPush} from "./sendSosPush";
export {deleteMyAccount} from "./deleteMyAccount";
export {requestPasswordResetOtp, confirmPasswordResetOtp} from "./passwordResetOtp";
