// Seed script for the counselling team allowlist — the small set of
// people permitted to see counselling requests (see CounsellingQueueScreen
// and the counsellingRequests rules in firestore.rules). Same
// admin-managed pattern as seed-event-coordinators.js, with one
// difference: each doc's ID here IS the counsellor's lowercased email
// (not a random ID) — that's what lets firestore.rules check
// membership with a plain exists() call. Edit this file, re-run, done.
// Each run fully replaces the counsellors collection with exactly
// what's below.
//
// !! Fill in a REAL name and email before running !! — the entry below
// is a placeholder and must not go live as-is.

const { initializeApp } = require("firebase-admin/app");
const { cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const counsellors = [
  {
    name: "PLACEHOLDER — replace with the real counsellor's name",
    email: "counsellor@iiitsurat.ac.in",
  },
];

async function seed() {
  const existing = await db.collection("counsellors").get();
  const batch1 = db.batch();
  existing.docs.forEach((doc) => batch1.delete(doc.ref));
  await batch1.commit();

  const batch2 = db.batch();
  counsellors.forEach((c) => {
    const email = c.email.toLowerCase();
    const ref = db.collection("counsellors").doc(email); // doc ID == email, on purpose
    batch2.set(ref, { name: c.name, email });
  });
  await batch2.commit();

  console.log(`Seeded ${counsellors.length} counsellor(s).`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
