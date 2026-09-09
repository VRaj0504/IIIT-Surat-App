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
name: "Ankit Kumar",
role: "Placement Coordinator",
branch: "ECE",
yearLabel: "3rd Year",
email: "ankitkumar@iiitsurat.ac.in",
},
{
name: "Darshan Dixit",
role: "Placement Coordinator",
branch: "CSE",
yearLabel: "3rd Year",
email: "darshandixit@iiitsurat.ac.in",
},
{
name: "Meet Parmar",
role: "Placement Coordinator",
branch: "CSE",
yearLabel: "3rd Year",
email: "meetparmar@iiitsurat.ac.in",
},
{
name: "Sakhee Mate",
role: "Placement Coordinator",
branch: "CSE",
yearLabel: "3rd Year",
email: "sakheemate@iiitsurat.ac.in",
},
{
name: "Sparsh Saxena",
role: "Placement Coordinator",
branch: "ECE",
yearLabel: "3rd Year",
email: "sparshsaxena@iiitsurat.ac.in",
},
{
name: "Tanmay Jain",
role: "Placement Coordinator",
branch: "ECE",
yearLabel: "3rd Year",
email: "tanmayjain@iiitsurat.ac.in",
},

{
  name : " Akshhita Shukla",
  role : "Junior Coordinator",
  branch : "CSE",
  yearLabel : "3rd Year",
 
}
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