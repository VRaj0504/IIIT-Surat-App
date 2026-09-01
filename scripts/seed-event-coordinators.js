// Seed script for event excusal coordinators — students permitted to
// submit a participant list for an inter-IIIT event, hackathon, etc. so
// their attendance for missed classes gets excused once a faculty
// coordinator approves it. Same admin-managed pattern as
// seed-tnp-coordinators.js: edit this file, re-run, done. Each run fully
// replaces the eventCoordinators collection with exactly what's below.
//
// Fill in real names/emails before running — everything below is a
// placeholder.

const { initializeApp } = require("firebase-admin/app");
const { cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const coordinators = [
  {
    name: "PLACEHOLDER — replace with real name",
    email: "placeholder@iiitsurat.ac.in",
  },
];

async function seed() {
  const existing = await db.collection("eventCoordinators").get();
  const batch1 = db.batch();
  existing.docs.forEach((doc) => batch1.delete(doc.ref));
  await batch1.commit();

  const batch2 = db.batch();
  coordinators.forEach((c) => {
    const ref = db.collection("eventCoordinators").doc();
    batch2.set(ref, {name: c.name, email: c.email.toLowerCase()});
  });
  await batch2.commit();

  console.log(`Seeded ${coordinators.length} event coordinator(s).`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
