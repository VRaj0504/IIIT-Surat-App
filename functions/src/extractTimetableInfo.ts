import {onCall, HttpsError} from "firebase-functions/v2/https";
import {ImageAnnotatorClient} from "@google-cloud/vision";

const visionClient = new ImageAnnotatorClient();

type ExtractTimetableRequest = {
  storagePath: string;
  bucket: string;
};

type ExtractedSlot = {
  day: string;
  startTime: string;
  endTime: string;
  rawText: string; // everything OCR found in this cell, concatenated — the
  // uploader splits this into subjectCode/subjectName/faculty/room
  // themselves, since reliably auto-splitting that from raw text is a
  // second hard problem on top of the first.
};

type ExtractTimetableResponse = {
  rawText: string; // the entire page's text, always available as a
  // fallback reference regardless of how well the bucketing below worked
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

// The dash between start and end time is optional, not just
// tolerant of different dash glyphs — Vision OCR sometimes drops the
// separator character entirely for a given column (observed: "09:00
// 10:00AM" with nothing but a space between them, right alongside
// other columns on the same page that DO read a dash correctly, e.g.
// "10:00 - 11:00AM"). Requiring a dash meant most of a real page's
// time columns silently failed to register at all.
const TIME_RANGE_PATTERN = /(\d{1,2}):?(\d{2})?\s*(AM|PM)?\s*[-–—]?\s*(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i;

type Word = {text: string; x: number; y: number; width: number; height: number};

// Flattens Vision's nested page/block/paragraph/word structure into a
// flat list of words with their bounding-box centers and sizes — the
// building block everything else here works from.
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
  }
  return `${String(h).padStart(2, "0")}:${m}`;
}

export const extractTimetableInfo = onCall<ExtractTimetableRequest, Promise<ExtractTimetableResponse>>(
  {region: "asia-south1"},
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
      const words = extractWords(result.fullTextAnnotation);

      if (words.length === 0) {
        return {rawText, slots: []};
      }

      const imageWidth = Math.max(...words.map((w) => w.x)) + 50;
      const imageHeight = Math.max(...words.map((w) => w.y)) + 50;

      // Day labels: any word matching a known day pattern, anywhere on
      // the page. Their Y-centers define each day-row's position. No
      // position restriction — the day-name patterns are exact,
      // anchored matches ("Mo", "Tu", ...), specific enough that
      // nothing else in a timetable (a subject code, room code, faculty
      // initial) could ever false-positive against them, so there's no
      // real benefit to also constraining by x-position — only risk,
      // since the day column's actual width varies (these PDFs often
      // render day labels in a much larger font than the rest of the
      // grid, pushing their center further right than a fixed fraction
      // of page width would assume).
      const dayWords = words.filter((w) =>
        DAY_PATTERNS.some((d) => d.pattern.test(w.text)),
      );
      const dayRows = dayWords
        .map((w) => {
          const match = DAY_PATTERNS.find((d) => d.pattern.test(w.text));
          return match ? {label: match.label, y: w.y} : null;
        })
        .filter((r): r is {label: string; y: number} => r !== null);

      // Time-range headers: words containing a "H:MM - H:MM"-shaped
      // pattern in the top ~25% of the image. Their X-centers define
      // each time-column's position. 25% (not a tighter band) because
      // real timetable exports commonly have a letterhead — a logo plus
      // "Indian Institute of..." plus a "SEMESTER X BRANCH SECTION"
      // title — sitting above the actual grid header, pushing it down
      // further than a bare "just below the top of the page" assumption
      // would expect. Too narrow a band here means timeColumns comes
      // back empty and the whole page silently returns zero slots even
      // though Vision read every cell correctly.
      //
      // Grouped into y-rows FIRST, then x-clustered within each row —
      // a wider band pulls in letterhead/title text too, and since that
      // text can share an x-range with the real header row while
      // sitting at a different y, clustering by x alone (ignoring y)
      // risks merging unrelated words together. Splitting into rows
      // first keeps each cluster's words on roughly the same line; the
      // title rows just never produce a TIME_RANGE_PATTERN match and
      // get silently discarded by flushCluster below, same as before.
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

      // If either axis couldn't be detected at all, bucketing is
      // meaningless — return the raw text only and let the uploader
      // transcribe manually. A wrong day/time is worse than an empty
      // pre-fill, since a wrong value looks confident and might not get
      // double-checked as carefully as an obviously-blank one.
      if (dayRows.length === 0 || timeColumns.length === 0) {
        return {rawText, slots: []};
      }

      // Every other word gets bucketed into whichever (day, time-column)
      // combination its position is closest to — a simple nearest-center
      // assignment, not true cell-boundary detection. Good enough to
      // roughly group text by day/slot; not good enough to trust without
      // reviewing every cell against the original photo.
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
        // Words within a bucket are joined left-to-right, top-to-bottom —
        // approximates natural reading order without needing full layout
        // analysis.
        const sorted = [...bucketWords].sort((a, b) => (a.y - b.y) * 1000 + (a.x - b.x));
        slots.push({day, startTime, endTime, rawText: sorted.map((w) => w.text).join(" ")});
      }

      return {rawText, slots};
    } catch (err: any) {
      throw new HttpsError("internal", `OCR failed: ${err.message}`);
    }
  },
);
