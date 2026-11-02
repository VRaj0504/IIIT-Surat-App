const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const emails = process.argv.slice(2).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0 || emails.some((e) => !e.endsWith("@iiitsurat.ac.in"))) {
    console.error("Usage: node scripts/set-complaint-committee.js member1@iiitsurat.ac.in member2@iiitsurat.ac.in ...");
    process.exit(1);
  }
  await db.collection("config").doc("complaints").set({ committeeEmails: emails, updatedAt: new Date() }, { merge: true });
  console.log("Complaints committee (sees and handles every student complaint, including harassment):");
  emails.forEach((e) => console.log(`  ${e}`));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
