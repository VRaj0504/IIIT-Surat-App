import "./globalOptions";
import {initializeApp} from "firebase-admin/app";
initializeApp();
import "./inboxCapture";


export {sendAnnouncementPush} from "./sendAnnouncementPush";
export {extractPosterInfo} from "./extractPosterInfo";
export {extractTimetableInfo} from "./extractTimetableInfo";
export {ingestFacultyEmail} from "./ingestFacultyEmail";
export {sendClassReminderPush} from "./sendClassReminderPush";
export {sendInboxImportPush} from "./sendInboxImportPush";

export {sendNoticePush} from "./sendNoticePush";
export {sendResourcePush} from "./sendResourcePush";

export {sendTimetableUpdatePush} from "./sendTimetableUpdatePush";
export {sendClassChangePush} from "./sendClassChangePush";
export {sendLowAttendancePush} from "./sendLowAttendancePush";
export {sendEventReminderPush} from "./sendEventReminderPush";
export {sendClubEventPush} from "./sendClubEventPush";
export {sendLeaveResolutionPush} from "./sendLeaveResolutionPush";
export {medicalLeaveWorkflow, medicalLeaveTeacherConfirmed} from "./medicalLeaveWorkflow";
export {syncMedicalExcusal} from "./syncMedicalExcusal";
export {medicalSubmit, medicalAct} from "./medicalRequest";
export {sendExcusalResolutionPush} from "./sendExcusalResolutionPush";
export {sendComplaintResolutionPush} from "./sendComplaintResolutionPush";
export {normalizeComplaint} from "./normalizeComplaint";

export {sendExamSchedulePush} from "./sendExamSchedulePush";
export {sendGradePush} from "./sendGradePush";
export {sendMarksPush} from "./sendMarksPush";
export {sendExamEventPush, sendExamEventUpdatePush} from "./sendExamEventPush";
export {sendHolidayPush} from "./sendHolidayPush";
export {sendQuizPush} from "./sendQuizPush";
export {extractExamSchedule} from "./extractExamSchedule";

export {sendDayStatusPush} from "./sendDayStatusPush";

export {syncRoleClaim} from "./syncRoleClaim";
export {syncRosterToUser} from "./syncRosterToUser";
export {backfillRoleClaims} from "./backfillRoleClaims";

export {sendCounsellingRequestPush} from "./sendCounsellingRequestPush";

export {cleanupResolvedDoubts} from "./cleanupResolvedDoubts";
export {sendSosPush} from "./sendSosPush";
export {deleteMyAccount} from "./deleteMyAccount";
export {getMyAttendanceSessions} from "./getMyAttendanceSessions";
export {requestPasswordResetOtp, confirmPasswordResetOtp} from "./passwordResetOtp";
export {createAccount} from "./createAccount";
export {createPlusSubscription, cancelPlusSubscription, razorpayWebhook} from "./plus";
export {sendMeetingPush} from "./sendMeetingPush";
export {getDirectorOverview} from "./getDirectorOverview";
export {archiveDatabase} from "./archiveDatabase";
