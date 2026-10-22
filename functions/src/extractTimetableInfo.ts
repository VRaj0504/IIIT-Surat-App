import {onCall, HttpsError} from "firebase-functions/v2/https";
import {ImageAnnotatorClient} from "@google-cloud/vision";
import * as admin from "firebase-admin";

const visionClient = new ImageAnnotatorClient();

type ExtractTimetableRequest = {
  storagePath: string;
  bucket: string;
};

type ExtractedSlot = {
  day: string;
  startTime: string;
  endTime: string;
  rawText: string;

};

type ExtractTimetableResponse = {
  rawText: string;

  slots: ExtractedSlot[];
};

const DAY_PATTERNS: {label: string; pattern: RegExp}[] = [
  {label: "Monday", pattern: /^mo(n(day)?)?$/i},
  {label: "Tuesday", pattern: /^tu(e(sday)?)?$/i},
  {label: "Wednesday", pattern: /^we(d(nesday)?)?$/i},
  {label: "Thursday", pattern: /^th(u(rsday)?)?$/i},
  {label: "Friday", pattern: /^fr(i(day)?)?$/i},
  {label: "Saturday", pattern: /^sa(t(urday)?)?$/i},
  {label: "Sunday", pattern: /^su(n(day)?)?$/i},
];

const TIME_RANGE_PATTERN = /(\d{1,2}):?(\d{2})?\s*(AM|PM)?\s*[-–—]?\s*(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i;

type Word = {text: string; x: number; y: number; width: number; height: number};

function extractWords(fullTextAnnotation: any): Word[] {
  const words: Word[] = [];
  const pages = fullTextAnnotation?.pages ?? [];
  for (const page of pages) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const text = (word.symbols ?? []).map((s: any) => s.text).join("");
          const vertices = word.boundingBox?.vertices ?? [];
          if (vertices.length < 4 || !text) continue;
          const xs = vertices.map((v: any) => v.x ?? 0);
          const ys = vertices.map((v: any) => v.y ?? 0);
          words.push({
            text,
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: (Math.min(...ys) + Math.max(...ys)) / 2,
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
          });
        }
      }
    }
  }
  return words;
}

function normalizeTime(hour: string, minute: string | undefined, meridiem: string | undefined): string {
  let h = parseInt(hour, 10);
  const m = minute ?? "00";
  if (meridiem) {
    const isPM = /pm/i.test(meridiem);
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
  } else if (h >= 1 && h <= 7) {

    h += 12;
  }

  return `${h}:${m}`;
}

export const extractTimetableInfo = onCall<ExtractTimetableRequest, Promise<ExtractTimetableResponse>>(
  {region: "asia-south1"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const {storagePath} = request.data;
    if (!storagePath || typeof storagePath !== "string") {
      throw new HttpsError("invalid-argument", "Missing storagePath.");
    }

    const callerSnap = await admin.firestore().collection("users").doc(request.auth.uid).get();
    const callerRole = callerSnap.data()?.role;
    if (callerRole !== "faculty" && callerRole !== "admin") {
      throw new HttpsError("permission-denied", "Only faculty can import timetables.");
    }

    const ownPrefix = `timetableScans/${request.auth.uid}/`;
    if (!storagePath.startsWith(ownPrefix) || storagePath.includes("..")) {
      throw new HttpsError("permission-denied", "You can only scan your own uploads.");
    }
    const gcsUri = `gs://${admin.storage().bucket().name}/${storagePath}`;

    try {
      const [result] = await visionClient.documentTextDetection(gcsUri);
      const rawText = result.fullTextAnnotation?.text ?? "";
      const words = extractWords(result.fullTextAnnotation);

      if (words.length === 0) {
        return {rawText, slots: []};
      }

      const imageWidth = Math.max(...words.map((w) => w.x)) + 50;
      const imageHeight = Math.max(...words.map((w) => w.y)) + 50;

      const dayWords = words.filter((w) =>
        DAY_PATTERNS.some((d) => d.pattern.test(w.text)),
      );
      const dayRows = dayWords
        .map((w) => {
          const match = DAY_PATTERNS.find((d) => d.pattern.test(w.text));
          return match ? {label: match.label, y: w.y} : null;
        })
        .filter((r): r is {label: string; y: number} => r !== null);

      const headerBandWordsRaw = words.filter((w) => w.y < imageHeight * 0.25);
      const headerRows: Word[][] = [];
      for (const w of [...headerBandWordsRaw].sort((a, b) => a.y - b.y)) {
        const lastRow = headerRows[headerRows.length - 1];
        if (lastRow && w.y - lastRow[lastRow.length - 1].y < imageHeight * 0.02) {
          lastRow.push(w);
        } else {
          headerRows.push([w]);
        }
      }

      const timeColumns: {startTime: string; endTime: string; x: number}[] = [];
      const headerWordsUsed = new Set<Word>();
      for (const row of headerRows) {
        const sortedRow = [...row].sort((a, b) => a.x - b.x);
        let cluster: Word[] = [];
        const flushCluster = () => {
          if (cluster.length === 0) return;
          const joined = cluster.map((w) => w.text).join(" ");
          const match = joined.match(TIME_RANGE_PATTERN);
          if (match) {
            const startTime = normalizeTime(match[1], match[2], match[3] ?? match[6]);
            const endTime = normalizeTime(match[4], match[5], match[6]);
            const avgX = cluster.reduce((sum, w) => sum + w.x, 0) / cluster.length;
            timeColumns.push({startTime, endTime, x: avgX});
            cluster.forEach((w) => headerWordsUsed.add(w));
          }
          cluster = [];
        };
        for (const w of sortedRow) {
          if (cluster.length > 0 && w.x - cluster[cluster.length - 1].x > imageWidth * 0.08) {
            flushCluster();
          }
          cluster.push(w);
        }
        flushCluster();
      }

      if (dayRows.length === 0 || timeColumns.length === 0) {
        return {rawText, slots: []};
      }

      const buckets = new Map<string, Word[]>();
      const contentWords = words.filter(
        (w) => !dayWords.includes(w) && !headerWordsUsed.has(w) && w.y >= imageHeight * 0.25,
      );
      for (const w of contentWords) {
        const nearestDay = dayRows.reduce((best, d) =>
          Math.abs(d.y - w.y) < Math.abs(best.y - w.y) ? d : best,
        );
        const nearestCol = timeColumns.reduce((best, c) =>
          Math.abs(c.x - w.x) < Math.abs(best.x - w.x) ? c : best,
        );
        const key = `${nearestDay.label}|${nearestCol.startTime}|${nearestCol.endTime}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(w);
      }

      const slots: ExtractedSlot[] = [];
      for (const [key, bucketWords] of buckets.entries()) {
        const [day, startTime, endTime] = key.split("|");

        const sorted = [...bucketWords].sort((a, b) => (a.y - b.y) * 1000 + (a.x - b.x));
        slots.push({day, startTime, endTime, rawText: sorted.map((w) => w.text).join(" ")});
      }

      return {rawText, slots};
    } catch (err: any) {
      throw new HttpsError("internal", `OCR failed: ${err.message}`);
    }
  },
);
