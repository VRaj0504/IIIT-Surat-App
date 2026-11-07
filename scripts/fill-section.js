const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const [branch, year, section] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");

async function main() {
  if (!branch || !year || !section) {
    console.error('Usage: node scripts/fill-section.js ECE 2024 ECE [--apply]');
    process.exit(1);
  }
  const snap = await db.collection("roster").where("branch", "==", branch).where("admissionYear", "==", Number(year)).get();
  const missing = snap.docs.filter((d) => !String(d.data().section || "").trim());
  const withSec = snap.size - missing.length;
  console.log(`${branch} ${year} batch: ${snap.size} students, ${withSec} with a section, ${missing.length} without.`);
  missing.forEach((d) => console.log(`  ${d.id}  ${d.data().name || ""}`));

  const sess = await db.collection("attendanceSessions").where("branch", "==", branch).where("admissionYear", "==", Number(year)).get();
  const bySec = {};
  sess.docs.forEach((d) => {
    const s = d.data().section == null ? "(none)" : d.data().section;
    bySec[s] = (bySec[s] || 0) + 1;
  });
  console.log(`\nAttendance sessions for this batch by section:`, bySec);

  if (!apply) {
    console.log(`\nDry run. To give these ${missing.length} students section "${section}":`);
    console.log(`  node scripts/fill-section.js ${branch} ${year} "${section}" --apply`);
    return;
  }
  for (let i = 0; i < missing.length; i += 400) {
    const b = db.batch();
    missing.slice(i, i + 400).forEach((d) => b.update(d.ref, { section }));
    await b.commit();
  }
  console.log(`\nDone. ${missing.length} students now in section "${section}".`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
