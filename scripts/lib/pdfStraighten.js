// Finds PDF pages whose text runs sideways and turns them upright.
// Used by scripts/straighten-pdfs.js. The faculty portal has the same logic in src/pdfStraighten.ts.
//
// How it decides: for each page it reads the direction of every piece of text. If at least 80% of the
// characters run the same way and that way is not upright, the page's rotation setting is changed so a
// viewer shows it upright. Only the setting changes; the page content is not redrawn or recompressed.
// Pages with little or no text (scans, photos) are left alone.

const MIN_CHARS = 20;
const MIN_SHARE = 0.8;

let pdfjsPromise;
const loadPdfjs = () => (pdfjsPromise ||= import("pdfjs-dist/legacy/build/pdf.mjs"));

/** Returns one entry per page: { current, wanted } rotation in degrees (0, 90, 180, 270). wanted is null when unsure. */
async function pageRotations(bytes) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, useSystemFonts: true });
  const doc = await task.promise;
  const out = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const current = ((page.rotate % 360) + 360) % 360;
      const text = await page.getTextContent();
      const chars = { 0: 0, 90: 0, 180: 0, 270: 0 };
      let total = 0;
      for (const item of text.items) {
        const len = (item.str || "").trim().length;
        if (!len || !item.transform) continue;
        const [a, b] = item.transform;
        if (!a && !b) continue;
        const angle = (((Math.round((Math.atan2(b, a) * 180) / Math.PI / 90) * 90) % 360) + 360) % 360;
        chars[angle] += len;
        total += len;
      }
      let wanted = null;
      if (total >= MIN_CHARS) {
        const best = Object.keys(chars).reduce((x, y) => (chars[y] > chars[x] ? y : x));
        if (chars[best] / total >= MIN_SHARE) wanted = Number(best);
      }
      out.push({ current, wanted });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return out;
}

/**
 * Returns { bytes, fixed, pages }.
 * fixed = how many pages were turned; bytes = the corrected PDF (or null when nothing needed fixing).
 */
async function straightenPdf(bytes) {
  const rotations = await pageRotations(bytes);
  const turn = rotations.map((r, i) => ({ i, ...r })).filter((r) => r.wanted !== null && r.wanted !== r.current);
  if (!turn.length) return { bytes: null, fixed: 0, pages: rotations.length };

  const { PDFDocument, degrees } = require("pdf-lib");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = pdf.getPages();
  if (pages.length !== rotations.length) throw new Error("page count mismatch");
  for (const t of turn) pages[t.i].setRotation(degrees(t.wanted));
  const fixedBytes = await pdf.save();

  // Check the result really is upright before anyone uses it.
  const after = await pageRotations(fixedBytes);
  const still = after.filter((r) => r.wanted !== null && r.wanted !== r.current).length;
  if (after.length !== rotations.length || still) throw new Error("check after fixing failed");

  return { bytes: Buffer.from(fixedBytes), fixed: turn.length, pages: rotations.length };
}

module.exports = { straightenPdf, pageRotations };
