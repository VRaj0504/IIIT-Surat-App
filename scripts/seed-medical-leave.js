// Sets up the medical-leave approval chain: who the doctor is, and which
// HOD approves for each branch. Writes config/medicalLeave (read by the
// app when a student applies, and checked by firestore.rules so a
// student can't route their leave to anyone else).
//
// Run: node scripts/seed-medical-leave.js   (needs serviceAccountKey.json)
// Safe to re-run any time — e.g. when the real doctor's email arrives.
//
// TEMPORARY: Dr. Rachit Nimavat handles the doctor step until the
// medical officer's (Dr. Paresh Chhotala) institute email is available.

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DOCTOR = {
  name: "Dr. Rachit Nimavat",
  email: "rachit.nimavat@iiitsurat.ac.in",
  designation: "Medical Officer",
};

// Student's branch -> the HOD who approves after the doctor.
// Emails must be the HOD's own sign-in email (not the hod.xxx@ role inbox).
const HOD_BY_BRANCH = {
  CSE: { name: "Dr. Ritesh Kumar", email: "riteshkumar@iiitsurat.ac.in" },
  ECE: { name: "Dr. Sudeep Sharma", email: "sudeep.sharma@iiitsurat.ac.in" },
  MNC: { name: "Dr. Anand Pratap Singh", email: "apsingh@iiitsurat.ac.in" },
};

async function main() {
  if (DOCTOR.email.startsWith("REPLACE_")) {
    console.error("Set DOCTOR.email to the doctor's real institute email first.");
    process.exit(1);
  }
  const lower = (o) => ({ ...o, email: o.email.trim().toLowerCase() });
  const doctor = lower(DOCTOR);
  const hods = Object.fromEntries(Object.entries(HOD_BY_BRANCH).map(([b, h]) => [b, lower(h)]));

  await db.collection("config").doc("medicalLeave").set({
    doctor: { name: doctor.name, email: doctor.email },
    hodByBranch: hods,
    updatedAt: new Date(),
  });

  // Make sure the doctor can sign in. Someone already on the faculty
  // allowlist (e.g. a faculty member covering temporarily) is left exactly
  // as they are; only a new person gets added.
  const docRef = db.collection("allowlist").doc(doctor.email);
  const existing = await docRef.get();
  if (!existing.exists) {
    await docRef.set({ role: "faculty", name: doctor.name, department: "MEDICAL", designation: doctor.designation });
    console.log(`Added ${doctor.email} to the faculty allowlist.`);
  } else if (existing.data().role !== "faculty") {
    console.warn(`WARNING: ${doctor.email} is on the allowlist but not as faculty — they won't be able to approve.`);
  }

  // Sanity check: every HOD should already be on the faculty allowlist.
  for (const [branch, h] of Object.entries(hods)) {
    const snap = await db.collection("allowlist").doc(h.email).get();
    if (!snap.exists) console.warn(`WARNING: ${branch} HOD ${h.email} is not on the allowlist.`);
  }

  console.log("Medical leave chain saved:");
  console.log(`  Doctor: ${doctor.name} <${doctor.email}>`);
  for (const [b, h] of Object.entries(hods)) console.log(`  ${b} HOD: ${h.name} <${h.email}>`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});