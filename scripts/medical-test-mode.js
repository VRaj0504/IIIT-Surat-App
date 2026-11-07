const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const args = process.argv.slice(2);
const restore = args.includes("--restore");
const email = (args.find((a) => !a.startsWith("--")) || "").trim().toLowerCase();

const live = db.collection("config").doc("medicalLeave");
const backup = db.collection("config").doc("medicalLeaveBackup");

async function main() {
  if (restore) {
    const b = await backup.get();
    if (!b.exists) {
      console.error("No backup found. Nothing restored.");
      process.exit(1);
    }
    const { _backedUpAt, ...data } = b.data();
    await live.set(data);
    await backup.delete();
    console.log("Real medical leave routing restored.");
    process.exit(0);
  }

  if (!email.endsWith("@iiitsurat.ac.in")) {
    console.error("Usage: node scripts/medical-test-mode.js <test-faculty-email@iiitsurat.ac.in>");
    console.error("       node scripts/medical-test-mode.js --restore");
    process.exit(1);
  }

  const allow = await db.collection("allowlist").doc(email).get();
  if (!allow.exists || allow.data().role !== "faculty") {
    console.error(`${email} is not on the faculty allowlist. Run: node scripts/add-faculty.js ${email} "Test Approver"`);
    process.exit(1);
  }

  const current = await live.get();
  const existing = await backup.get();
  if (current.exists && !existing.exists) {
    await backup.set({ ...current.data(), _backedUpAt: new Date() });
    console.log("Saved the real routing to config/medicalLeaveBackup.");
  }

  const p = { name: "Test Approver", email };
  await live.set({
    flow: 2,
    office: p,
    medicalOfficer: p,
    hods: [{ department: "CSE", ...p }],
    hodEmails: [email],
    hodByBranch: { CSE: p },
    dean: p,
    jr: p,
    lateLimitDays: 4,
    updatedAt: new Date(),
  });
  console.log(`Test mode on. Office, Medical Officer, HOD, Dean and Joint Registrar are all ${email}.`);
  console.log("When finished: node scripts/medical-test-mode.js --restore");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
