// One-time script to nest SARAS's sub-clubs under it, by setting
// parentClubId on each. Uses the admin SDK (same serviceAccountKey.json
// as the other seed-*.js scripts), so it bypasses auth/security rules
// entirely — run once, done, safe to re-run any time (it just sets the
// same field to the same value again, no duplicate side effects).
//
// Looks SARAS up by name rather than hardcoding its document ID, so this
// still works even if the club was ever deleted and recreated.

const { initializeApp } = require("firebase-admin/app");
const { cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const SUB_CLUB_NAMES = [
  "Antra (Poetry Club)",
  "Abstract (Art and Design Club)",
  "Malhar (Drama Club)",
  "Exposure (Photography Club)",
  "Cineworks (Videography Club)",
  "Swarang (Singing Club)",
  "Groove (Dance Club)",
  "Management (Cultural Club Core Team)",
];

async function main() {
  const sarasSnap = await db.collection("clubs").where("name", "==", "SARAS").get();
  if (sarasSnap.empty) {
    console.error('Could not find a club named exactly "SARAS" — check the name matches.');
    process.exit(1);
  }
  const sarasId = sarasSnap.docs[0].id;
  console.log(`SARAS found: ${sarasId}\n`);

  for (const name of SUB_CLUB_NAMES) {
    const snap = await db.collection("clubs").where("name", "==", name).get();
    if (snap.empty) {
      console.log(`NOT FOUND — skipped: ${name}`);
      continue;
    }
    if (snap.size > 1) {
      console.log(`AMBIGUOUS (${snap.size} matches) — skipped: ${name}`);
      continue;
    }
    await snap.docs[0].ref.update({ parentClubId: sarasId });
    console.log(`updated  ${name}`);
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err.message ?? err);
  process.exit(1);
});