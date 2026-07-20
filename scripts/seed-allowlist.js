// One-time script to populate the `allowlist` collection.
// The Admin SDK bypasses Firestore security rules entirely, which is why
// this has to run outside the app (rules block all client writes to
// `allowlist` on purpose -- see firestore.rules).
//
// SETUP:
// 1. npm install firebase-admin
// 2. Firebase Console -> Project Settings -> Service Accounts -> Generate new
//    private key. Save the downloaded file as serviceAccountKey.json in this
//    same folder. NEVER commit this file or share it -- it has full admin
//    access to your project.
// 3. node seed-allowlist.js
//
// Safe to re-run: existing docs are overwritten with the same data (merge),
// nothing is deleted.

const { initializeApp } = require("firebase-admin/app");
const { cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const allowlist = {
  "rkpatel@iiitsurat.ac.in": { "role": "faculty", "name": "Mr. Rahul K Patel", "department": "UGECE" },
  "dhiraj.patel@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Dhiraj Kumar Patel", "department": "UGECE" },
  "sejalrathod@iiitsurat.ac.in": { "role": "faculty", "name": "Ms. Sejal K Rathod", "department": "UGECE" },
  "rishi_sharma@iiitsurat.ac.in": { "role": "faculty", "name": "Mr. Rishi Kumar Sharma", "department": "UGCSE" },
  "nidhidesai@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Nidhi Nitin Desai", "department": "UGCSE" },
  "rahul.singh@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Rahul Singh", "department": "UGCSE" },
  "trupti.gondaliya@iiitsurat.ac.in": { "role": "faculty", "name": "Ms. Trupti Gondaliya", "department": "UGCSE" },
  "shreya.agarwal@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Shreya Agarwal", "department": "UGCSE" },
  "rahul.mishra@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Rahul Dev Mishra", "department": "UGECE" },
  "anandatheertan@iiitsurat.ac.in": { "role": "faculty", "name": "Mr. Anandatheertan Srinivasan", "department": "UGECE" },
  "reema.patel@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Reema Patel", "department": "UGCSE" },
  "hsgoklani@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Hemantkumar Sahijram Goklani", "department": "UGECE" },
  "riteshkumar@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Ritesh Kumar", "department": "UGCSE" },
  "dubey.tanmay@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Tanmay Dubey", "department": "UGECE" },
  "sudeep.sharma@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Sudeep Sharma", "department": "UGECE" },
  "shriman.narayana@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Shriman Narayana", "department": "UGECE" },
  "svrao@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Sivavenkateswara Rao V.", "department": "UGECE" },
  "aneelima@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Neelima Agrawal", "department": "UGECE" },
  "venkata.chavali@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Venkata Annapurna Priyadarshini Chavali", "department": "UGECE" },
  "kaustubh.dhondge@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Kaustubh Dhondge", "department": "UGECE" },
  "manish.rai@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Manish Kumar Rai", "department": "UGECE" },
  "rachit.nimavat@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Rachit Nimavat", "department": "UGCSE" },
  "khamosh.yadav@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Khamosh Yadav", "department": "UGPAS" },
  "nishad.deshpande@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Nishad Gopal Deshpande", "department": "UGPAS" },
  "bikash.patra@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Bikash Patra", "department": "UGPAS" },
  "aarti.patle@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Aarti Patle", "department": "UGMCS" },
  "vijay.patel@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Vijay Kumar Patel", "department": "UGMCS" },
  "apsingh@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Anand Pratap Singh", "department": "UGMCS" },
  "shikha.maurya@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Shikha Maurya", "department": "UGECE" },
  "pradeep.singh@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Pradeep Singh", "department": "UGCSE" },
  "sameer.singh@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Sameer Kumar Singh", "department": "UGECE" },
  "prarthana.mehta@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Prarthana Jagat Mehta", "department": "UGCSE" },
  "lokendra.chouhan@iiitsurat.ac.in": { "role": "faculty", "name": "Dr. Lokendra Chouhan", "department": "UGECE" },
  "ug25cse114@iiitsurat.ac.in": { "role": "admin" }
};

async function seed() {
  const entries = Object.entries(allowlist);
  console.log(`Seeding ${entries.length} allowlist entries...`);
  let batch = db.batch();
  let count = 0;
  for (const [email, data] of entries) {
    batch.set(db.collection("allowlist").doc(email), data, { merge: true });
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  console.log("Done. Seeded:", entries.map(([email]) => email).join(", "));
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
