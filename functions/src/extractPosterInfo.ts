import {onCall, HttpsError} from "firebase-functions/v2/https";
import {ImageAnnotatorClient} from "@google-cloud/vision";
import * as admin from "firebase-admin";

const visionClient = new ImageAnnotatorClient();

type ExtractPosterInfoRequest = {
  storagePath: string;
  bucket: string;
};

type ExtractPosterInfoResponse = {
  rawText: string;
  guessedTitle: string | null;
  guessedDate: string | null;
  guessedTime: string | null;
};

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_PATTERN = "[a-z]{3,12}";

function monthIndexFromToken(token: string): number {
  const t = token.toLowerCase();

  return MONTH_NAMES.findIndex((m) => {
    const prefixLen = Math.min(4, m.length);
    return t.startsWith(m.slice(0, prefixLen)) || m.startsWith(t.slice(0, prefixLen));
  });
}

function extractDate(text: string): string | null {
  const lower = text.toLowerCase();

  const namedMonthMatch = lower.match(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(${MONTH_PATTERN})\\s*,?\\s*(\\d{4})\\b`),
  );
  if (namedMonthMatch) {
    const day = namedMonthMatch[1].padStart(2, "0");
    const monthIndex = monthIndexFromToken(namedMonthMatch[2]);
    const year = namedMonthMatch[3];
    if (monthIndex !== -1) {
      return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day}`;
    }
  }

  const monthFirstMatch = lower.match(
    new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`),
  );
  if (monthFirstMatch) {
    const monthIndex = monthIndexFromToken(monthFirstMatch[1]);
    const day = monthFirstMatch[2].padStart(2, "0");
    const year = monthFirstMatch[3];
    if (monthIndex !== -1) {
      return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day}`;
    }
  }

  const numericMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (numericMatch) {
    const day = numericMatch[1].padStart(2, "0");
    const month = numericMatch[2].padStart(2, "0");
    const year = numericMatch[3];
    if (Number(month) <= 12) {
      return `${year}-${month}-${day}`;
    }
  }

  return null;
}

function extractTime(text: string): string | null {
  const twelveHourMatch = text.match(/\b(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)\b/);
  if (twelveHourMatch) {
    let hour = parseInt(twelveHourMatch[1], 10);
    const minute = twelveHourMatch[2] ?? "00";
    const isPM = /pm/i.test(twelveHourMatch[3]);
    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${minute}`;
  }

  const twentyFourHourMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHourMatch) {
    return `${twentyFourHourMatch[1].padStart(2, "0")}:${twentyFourHourMatch[2]}`;
  }

  return null;
}

function guessTitle(fullTextAnnotation: any): string | null {
  const pages = fullTextAnnotation?.pages;
  if (!pages || pages.length === 0) return null;
  const page = pages[0];
  const pageHeight = page.height ?? 1000;
  const topThird = pageHeight / 3;

  let bestLine = "";

  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      const words = (paragraph.words ?? []).map((w: any) =>
        (w.symbols ?? []).map((s: any) => s.text).join(""),
      );
      const line = words.join(" ").trim();
      const boundingBox = paragraph.boundingBox?.vertices?.[0];
      const y = boundingBox?.y ?? Infinity;
      if (y <= topThird && line.length > bestLine.length) {
        bestLine = line;
      }
    }
  }

  return bestLine || null;
}

export const extractPosterInfo = onCall<ExtractPosterInfoRequest, Promise<ExtractPosterInfoResponse>>(
  {

    region: "asia-south1",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const {storagePath} = request.data;
    if (!storagePath || typeof storagePath !== "string") {
      throw new HttpsError("invalid-argument", "Missing storagePath.");
    }

    const ownPrefix = `posterScans/${request.auth.uid}/`;
    if (!storagePath.startsWith(ownPrefix) || storagePath.includes("..")) {
      throw new HttpsError("permission-denied", "You can only scan your own uploads.");
    }
    const gcsUri = `gs://${admin.storage().bucket().name}/${storagePath}`;

    try {
      const [result] = await visionClient.documentTextDetection(gcsUri);
      const rawText = result.fullTextAnnotation?.text ?? "";

      return {
        rawText,
        guessedTitle: guessTitle(result.fullTextAnnotation),
        guessedDate: extractDate(rawText),
        guessedTime: extractTime(rawText),
      };
    } catch (err: any) {
      throw new HttpsError("internal", `OCR failed: ${err.message}`);
    }
  },
);
