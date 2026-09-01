// One-time / re-run-as-needed seed script for TnP Cell student
// coordinators — a small, informal list of student volunteers, NOT part
// of the faculty allowlist or the official student roster. Managed the
// same way seed-allowlist.js manages faculty: edit this file, re-run,
// done. Safe to re-run any time the list changes; each run fully
// replaces the tnpCoordinators collection with exactly what's below.
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
    role: "Placement Coordinator",
    branch: "CSE",
    yearLabel: "3rd Year",
    email: "placeholder@iiitsurat.ac.in",
    phone: "",
  },
];

async function seed() {
  // Fully replaces the collection each run — deletes anything no longer
  // in the list above, so removing a coordinator here removes them from
  // the app too, not just adding new ones.
  const existing = await db.collection("tnpCoordinators").get();
  const batch1 = db.batch();
  existing.docs.forEach((doc) => batch1.delete(doc.ref));
  await batch1.commit();

  const batch2 = db.batch();
  coordinators.forEach((c) => {
    const ref = db.collection("tnpCoordinators").doc();
    batch2.set(ref, c);
  });
  await batch2.commit();

  console.log(`Seeded ${coordinators.length} TnP student coordinator(s).`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
