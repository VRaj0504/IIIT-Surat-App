// Deletes EVERY resource in the app — every Notes/PYQ/Slides upload,
// across every branch/semester/section, for good. Two things get
// deleted, not just one: the Firestore metadata doc (what the app
// queries) AND the actual file sitting in Storage under resources/... —
// resourceService.ts's uploadResource() writes both, so a real clean
// slate needs both wiped, not just the doc (which would leave every
// file orphaned in Storage, still costing space, just unreachable from
// the app).
//
// Defaults to a DRY RUN — prints what it WOULD delete and stops there.
// Nothing is actually deleted until you re-run with --confirm:
//
//   node wipe-resources.js            (dry run — just counts/lists)
//   node wipe-resources.js --confirm  (actually deletes everything)
//
// Irreversible. Run only when you actually want a clean slate.

const { initializeApp } = require("firebase-admin/app");
const { cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
  // Admin SDK needs to be told the bucket explicitly here (unlike the
  // client SDK's getStorage(), which infers it from firebaseConfig.ts's
  // storageBucket) — same project, just a different SDK's defaults.
  //
  // This MUST match EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET in .env exactly —
  // it is NOT always `${project_id}.appspot.com` (that's the OLD default
  // naming convention; this project's real bucket, confirmed against
  // .env, is the newer `${project_id}.firebasestorage.app` instead). A
  // wrong guess here fails with "The specified bucket does not exist."
  // AFTER the Firestore side has already been read, which is why the
  // dry-run's doc listing above still worked even when this was wrong.
  storageBucket: "iiit-surat-app-6643d.firebasestorage.app",
});

const db = getFirestore();
const bucket = getStorage().bucket();

const CONFIRMED = process.argv.includes("--confirm");

async function main() {
  console.log(CONFIRMED ? "Running for real — this will delete everything.\n" : "DRY RUN — nothing will be deleted. Re-run with --confirm to actually do it.\n");

  // --- Firestore: every doc in the resources collection ---
  const snap = await db.collection("resources").get();
  console.log(`Firestore: ${snap.size} resource doc(s) found.`);
  if (snap.size > 0) {
    console.log("  Sample of what's there:");
    snap.docs.slice(0, 5).forEach((d) => {
      const r = d.data();
      console.log(`    - [${r.type}] ${r.title} (${r.branch} sem ${r.semester})`);
    });
    if (snap.size > 5) console.log(`    ...and ${snap.size - 5} more`);
  }

  // --- Storage: every file under the resources/ prefix ---
  const [files] = await bucket.getFiles({ prefix: "resources/" });
  console.log(`\nStorage: ${files.length} file(s) found under resources/.`);
  if (files.length > 0) {
    console.log("  Sample of what's there:");
    files.slice(0, 5).forEach((f) => console.log(`    - ${f.name}`));
    if (files.length > 5) console.log(`    ...and ${files.length - 5} more`);
  }

  if (!CONFIRMED) {
    console.log("\nDry run complete. Re-run with --confirm to actually delete all of this.");
    return;
  }

  console.log("\nDeleting Storage files...");
  // Firestore batches cap at 500 writes; deleteFiles() has no such cap
  // (it paginates internally), so Storage can go in one call.
  await bucket.deleteFiles({ prefix: "resources/" });
  console.log(`  Deleted ${files.length} file(s).`);

  console.log("\nDeleting Firestore docs...");
  const BATCH_SIZE = 500;
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    snap.docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += Math.min(BATCH_SIZE, snap.docs.length - i);
    console.log(`  ${deleted}/${snap.docs.length} doc(s) deleted...`);
  }

  console.log("\nDone. Resources collection and Storage folder are both empty.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
