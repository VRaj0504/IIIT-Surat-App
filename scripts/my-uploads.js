const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const who = (process.argv[2] || "").trim();

async function main() {
  console.log(`Project: ${serviceAccount.project_id}`);
  let uid = who;
  if (who.includes("@")) {
    const u = await db.collection("users").where("email", "==", who.toLowerCase()).limit(1).get();
    if (u.empty) throw new Error("No account with that email.");
    uid = u.docs[0].id;
  }
  if (!uid) throw new Error("Usage: node scripts/my-uploads.js <email-or-uid>");
  const s = await db.collection("resources").where("uploadedBy", "==", uid).get();
  console.log(`Uploads by ${who}: ${s.size}\n`);
  s.docs.forEach((d) => {
    const r = d.data();
    console.log(`"${r.title}"`);
    console.log(`   branch=${JSON.stringify(r.branch)} semester=${JSON.stringify(r.semester)} (${typeof r.semester}) section=${JSON.stringify(r.section ?? null)}`);
    console.log(`   type=${r.type} subject=${JSON.stringify(r.subject)} academicYear=${r.academicYear ?? "-"} createdAt=${r.createdAt ? r.createdAt.toDate().toISOString() : "MISSING"}`);
  });
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
