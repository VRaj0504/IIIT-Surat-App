

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
yearLabel: "4th Year",
email: "ankitkumar@iiitsurat.ac.in",
},
{
name: "Darshan Dixit",
role: "Placement Coordinator",
branch: "CSE",
yearLabel: "4th Year",
email: "darshandixit@iiitsurat.ac.in",
},
{
name: "Meet Parmar",
role: "Placement Coordinator",
branch: "CSE",
yearLabel: "4th Year",
email: "meetparmar@iiitsurat.ac.in",
},
{
name: "Sakhee Mate",
role: "Placement Coordinator",
branch: "CSE",
yearLabel: "4th Year",
email: "sakheemate@iiitsurat.ac.in",
},
{
name: "Sparsh Saxena",
role: "Placement Coordinator",
branch: "ECE",
yearLabel: "4th Year",
email: "sparshsaxena@iiitsurat.ac.in",
},
{
name: "Tanmay Jain",
role: "Placement Coordinator",
branch: "ECE",
yearLabel: "4th Year",
email: "tanmayjain@iiitsurat.ac.in",
},

{
  name : " Akshhita Shukla",
  role : "Junior Coordinator",
  branch : "CSE",
  yearLabel : "3rd Year",

},

{
  name : " Kinnari Dodiya",
  role : "Junior Coordinator",
  branch : "ECE",
  yearLabel : "3rd Year",

},
{
  name : " Purva Gala",
  role : "Junior Coordinator",
  branch : "CSE",
  yearLabel : "3rd Year",

},

{
  name : " Vibhor Jain",
  role : "Junior Coordinator",
  branch : "ECE",
  yearLabel : "3rd Year",

}
];
async function seed() {

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