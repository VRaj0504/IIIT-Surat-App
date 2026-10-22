

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
    name: "Vaibhav",
    email: "ug25cse114@iiitsurat.ac.in",
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
