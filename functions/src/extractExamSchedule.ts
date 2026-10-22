import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {getFirestore} from "firebase-admin/firestore";
import {extractRawExamRows, normalizeExtraction, ExamGroup} from "./examSheetExtraction";

const geminiKey = defineSecret("GEMINI_API_KEY");

type ExtractExamScheduleRequest = {
  fileBase64: string;
  mimeType: string;
  filename: string;
};

type ExtractExamScheduleResponse = {
  groups: ExamGroup[];
  warnings: string[];
  rowCount: number;
};

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

const MAX_BYTES = 6.5 * 1024 * 1024;

export const extractExamSchedule = onCall<ExtractExamScheduleRequest, Promise<ExtractExamScheduleResponse>>(
  {region: "asia-south1", secrets: [geminiKey], memory: "512MiB", timeoutSeconds: 120},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

    const userSnap = await getFirestore().collection("users").doc(request.auth.uid).get();
    const role = userSnap.data()?.role;
    if (role !== "faculty" && role !== "admin") {
      throw new HttpsError("permission-denied", "Only faculty can import a date sheet.");
    }

    const {fileBase64, mimeType} = request.data ?? {};
    if (!fileBase64 || !mimeType || !ALLOWED_TYPES.includes(mimeType)) {
      throw new HttpsError("invalid-argument", "Send a PDF, JPG or PNG.");
    }
    const buffer = Buffer.from(fileBase64, "base64");
    if (buffer.length > MAX_BYTES) {
      throw new HttpsError("invalid-argument", "That file is over 6.5 MB — compress the PDF or upload a smaller scan.");
    }

    try {
      const raw = await extractRawExamRows(geminiKey.value(), buffer, mimeType);
      const result = normalizeExtraction(raw);
      logger.info("extractExamSchedule ok", {uid: request.auth.uid, groups: result.groups.length, rows: result.rowCount});
      return result;
    } catch (err: any) {
      logger.error("extractExamSchedule failed", {error: err.message});
      throw new HttpsError("internal", `Couldn't read the date sheet: ${err.message}`);
    }
  },
);
