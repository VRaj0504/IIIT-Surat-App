import {onCall, HttpsError} from "firebase-functions/v2/https";
import {ImageAnnotatorClient} from "@google-cloud/vision";

const visionClient = new ImageAnnotatorClient();

type ExtractPosterInfoRequest = {
  storagePath: string; // e.g. "posterScans/{uid}/{timestamp}.jpg"
  bucket: string;
};

type ExtractPosterInfoResponse = {
  rawText: string;
  guessedTitle: string | null;
  guessedDate: string | null; // "YYYY-MM-DD" — best-effort, always shown for confirmation client-side
  guessedTime: string | null; // "HH:mm" (24-hour) — best-effort
};

// Matches "25 August 2026", "25th Aug 2026", "August 25, 2026", "25/08/2026",
// "25-08-2026" — the handful of date formats actually common on posters.
// Month names are matched by their first 3-4 letters as a PREFIX inside
// the OCR'd word, not as an exact full-word match — real posters have
// typos ("SEPTEMEBER" instead of "SEPTEMBER") and OCR itself
// misreads characters sometimes, and requiring an exact match breaks on
// either. A missed date just means the confirm screen's date field
// starts blank instead of pre-filled, which is a minor inconvenience,
// not a wrong-data risk — unlike guessing wrong and silently trusting
// it.
const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_PATTERN = "[a-z]{3,12}"; // any word-like token; matched against MONTH_NAMES afterward, not by literal name

function monthIndexFromToken(token: string): number {
  const t = token.toLowerCase();
  // Try each real month name's first 4 letters (3 for "may") as a prefix
  // of the OCR'd token — catches "SEPTEMEBER" matching "sept", "AUGUST"
  // matching "augu", etc., without needing an exact full-word match.
  return MONTH_NAMES.findIndex((m) => {
    const prefixLen = Math.min(4, m.length);
    return t.startsWith(m.slice(0, prefixLen)) || m.startsWith(t.slice(0, prefixLen));
  });
}

function extractDate(text: string): string | null {
  const lower = text.toLowerCase();

  // "25 August 2026" / "25th Aug 2026" / "1ST SEPTEMEBER,2026"
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

  // "August 25, 2026" / "Aug 25 2026"
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

  // "25/08/2026" or "25-08-2026" — assumes DD/MM/YYYY (Indian convention),
  // not the US MM/DD/YYYY order.
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

// Matches "5:00 PM", "5 PM", "17:00" — again, best-effort only.
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

// Guesses the poster's title as the longest line of text within the top
// third of the image — posters conventionally lead with their biggest,
// most prominent text at the top. This is a rough heuristic, not a
// layout/font-size analysis (which Vision's bounding-box data could
// support with more work) — good enough to pre-fill a field the person
// is going to review anyway, not good enough to trust blindly.
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
    // Same region as every other callable in this app (placeOrderFn,
    // etc.) — this isn't just a latency nicety: the client's
    // functionsClient.ts is hardcoded to call the asia-south1 endpoint,
    // so a function deployed anywhere else genuinely can't be reached at
    // all (not slower — a real invocation failure), which is exactly
    // what caused "couldn't scan" the first time this deployed without
    // a region specified and defaulted to us-central1.
    region: "asia-south1",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const {storagePath, bucket} = request.data;
    if (!storagePath || !bucket) {
      throw new HttpsError("invalid-argument", "Missing storagePath or bucket.");
    }

    const gcsUri = `gs://${bucket}/${storagePath}`;

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
