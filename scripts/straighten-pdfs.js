// Finds Resources PDFs whose pages are sideways (for example slides saved with "Print to PDF" on
// portrait paper) and turns the pages upright.
//
//   node scripts/straighten-pdfs.js                 -> preview: lists the PDFs that need fixing
//   node scripts/straighten-pdfs.js --apply         -> fixes them
//   node scripts/straighten-pdfs.js --only=LEC-4    -> only files whose title or file name contains this text
//
// With --apply, for each sideways PDF it:
//   1. uploads the corrected file next to the old one (…-upright.pdf),
//   2. points every resource that used the old file at the new one,
//   3. moves the old file to backups/straightened/ (nothing is thrown away).
// Scanned or handwritten PDFs have no text to read, so they are skipped.

const crypto = require("crypto");
const { getDownloadURL } = require("firebase-admin/storage");
const { db, storage, FieldValue, opt, APPLY, run } = require("./lib/admin");
const { straightenPdf } = require("./lib/pdfStraighten");

const MAX_MB = 80;

run(async () => {
  const only = (opt("only") || "").toLowerCase();
  const bucket = storage.bucket();

  const snap = await db.collection("resources").get();
  const byPath = new Map();
  snap.docs.forEach((d) => {
    const p = d.data().storagePath;
    if (!p || !/\.pdf$/i.test(p)) return;
    if (only && !`${d.data().title || ""} ${p}`.toLowerCase().includes(only)) return;
    if (!byPath.has(p)) byPath.set(p, []);
    byPath.get(p).push(d);
  });

  console.log(`Checking ${byPath.size} PDF file(s)${only ? ` matching "${only}"` : ""}…\n`);
  let sideways = 0, fixed = 0, failed = 0, n = 0;

  for (const [path, docs] of byPath) {
    n++;
    const label = `${docs[0].data().title || "(no title)"}  [${docs[0].data().branch || ""} sem ${docs[0].data().semester || "?"}]`;
    try {
      const file = bucket.file(path);
      const [meta] = await file.getMetadata();
      if (Number(meta.size) > MAX_MB * 1024 * 1024) {
        console.log(`  skipped (over ${MAX_MB} MB): ${label}`);
        continue;
      }
      const [bytes] = await file.download();
      const res = await straightenPdf(bytes);
      if (!res.fixed) continue;

      sideways++;
      console.log(`${APPLY ? "FIXING" : "SIDEWAYS"}: ${label}\n    ${res.fixed} of ${res.pages} page(s) · ${path}`);
      if (!APPLY) continue;

      // 1. Upload the corrected file beside the old one.
      const newPath = path.replace(/\.pdf$/i, "-upright.pdf");
      const newFile = bucket.file(newPath);
      await newFile.save(res.bytes, {
        resumable: false,
        metadata: {
          contentType: "application/pdf",
          cacheControl: meta.cacheControl || "public,max-age=31536000,immutable",
          metadata: { firebaseStorageDownloadTokens: crypto.randomUUID(), straightenedFrom: path },
        },
      });
      const fileUrl = await getDownloadURL(newFile);

      // 2. Point every resource that used the old file at the new one.
      const batch = db.batch();
      docs.forEach((d) => batch.update(d.ref, { fileUrl, storagePath: newPath, straightenedAt: FieldValue.serverTimestamp() }));
      await batch.commit();

      // 3. Keep the original as a backup, out of the way.
      await file.move(`backups/straightened/${path}`);
      fixed++;
    } catch (e) {
      failed++;
      console.log(`  could not check: ${label} (${String(e.message).slice(0, 90)})`);
    }
    if (n % 25 === 0) console.log(`  …${n} of ${byPath.size} checked`);
  }

  console.log(`\nChecked ${byPath.size}. Sideways: ${sideways}. ${APPLY ? `Fixed: ${fixed}. ` : ""}Could not check: ${failed}.`);
  if (APPLY && fixed) console.log("Originals are kept in Storage under backups/straightened/.");
});
