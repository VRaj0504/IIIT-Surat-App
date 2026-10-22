

const { initializeApp } = require("firebase-admin/app");
const { cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),

  storageBucket: "iiit-surat-app-6643d.firebasestorage.app",
});

const db = getFirestore();
const bucket = getStorage().bucket();

const CONFIRMED = process.argv.includes("--confirm");

async function main() {
  console.log(CONFIRMED ? "Running for real — this will delete everything.\n" : "DRY RUN — nothing will be deleted. Re-run with --confirm to actually do it.\n");

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
