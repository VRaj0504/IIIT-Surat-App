

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
const CONFIRMED = process.argv.includes("--confirm");

const FIRESTORE_COLLECTIONS = ["grades", "complaints"];

const BATCH_SIZE = 500;

async function deleteCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();

  console.log(`Firestore: ${collectionName} → ${snapshot.size} document(s)`);

  if (!CONFIRMED || snapshot.empty) {
    return;
  }

  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);
    chunk.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    console.log(`  Deleted ${Math.min(i + BATCH_SIZE, snapshot.docs.length)}/${snapshot.docs.length}`);
  }
}

async function main() {
  console.log("\n======================================");
  console.log("     IIIT SURAT APP DATA RESET");
  console.log("======================================\n");

  if (CONFIRMED) {
    console.log("⚠️  LIVE MODE");
    console.log("The selected data WILL be permanently deleted.\n");
  } else {
    console.log("🔍 DRY RUN");
    console.log("Nothing will be deleted.");
    console.log("Run again with --confirm to actually delete the data.\n");
  }

  console.log("Firestore collections:");
  console.log("--------------------------------------");

  for (const collectionName of FIRESTORE_COLLECTIONS) {
    await deleteCollection(collectionName);
  }

  if (!CONFIRMED) {
    console.log("\n======================================");
    console.log("DRY RUN COMPLETE");
    console.log("======================================");
    console.log("\nNothing was deleted.");
    console.log("If these counts look correct, run:");
    console.log("\n  node scripts/reset-user-data.js --confirm\n");
    return;
  }

  console.log("\n======================================");
  console.log("RESET COMPLETE");
  console.log("======================================");
  console.log("\nThe following are now fresh:");
  console.log("  ✓ Grades / Transcript");
  console.log("  ✓ Complaints & Doubts");
  console.log("\nOther application data was NOT touched.");
}

main().catch((error) => {
  console.error("\n❌ Reset failed:");
  console.error(error);
  process.exit(1);
});
