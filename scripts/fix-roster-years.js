

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
initializeApp({ credential: cert(require("./serviceAccountKey.json")) });
const db = getFirestore();
const APPLY = process.argv.includes("--apply");

const yearOf = (regNo) => {
  const m = /^(?:UG|PG)(\d{2})/i.exec(String(regNo || "").trim());
  return m ? 2000 + Number(m[1]) : null;
};

async function main() {
  const snap = await db.collection("roster").get();
  const classes = {};
  const wrong = [];
  snap.docs.forEach((d) => {
    const r = d.data();
    const correct = yearOf(d.id);
    const year = correct ?? r.admissionYear;
    const label = `${r.branch} ${r.section || "(no section)"}`;
    ((classes[year] ??= {})[label] = (classes[year][label] || 0) + 1);
    if (correct && r.admissionYear !== correct) wrong.push({ id: d.id, label, saved: r.admissionYear, correct });
  });

  console.log("Classes per batch (by reg. no.):");
  for (const y of Object.keys(classes).sort().reverse()) {
    console.log(`  ${y}: ` + Object.entries(classes[y]).sort().map(([l, n]) => `${l} (${n})`).join(", "));
  }

  console.log(`\n${wrong.length} student(s) saved under the wrong year.`);
  const summary = {};
  wrong.forEach((w) => {
    const k = `${w.label}: saved ${w.saved} → should be ${w.correct}`;
    summary[k] = (summary[k] || 0) + 1;
  });
  Object.entries(summary).forEach(([k, n]) => console.log(`  ${k}  ×${n}`));
  if (!wrong.length) return;
  if (!APPLY) return console.log("\nRun again with --apply to fix them.");

  for (let i = 0; i < wrong.length; i += 400) {
    const batch = db.batch();
    wrong.slice(i, i + 400).forEach((w) => batch.update(db.collection("roster").doc(w.id), { admissionYear: w.correct }));
    await batch.commit();
  }

  let users = 0;
  for (const w of wrong) {
    const u = await db.collection("users").where("enrollmentNumber", "==", w.id).limit(1).get();
    if (!u.empty && u.docs[0].data().admissionYear !== w.correct) {
      await u.docs[0].ref.update({ admissionYear: w.correct });
      users++;
    }
  }
  console.log(`\nFixed ${wrong.length} roster entries and ${users} user profile(s).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
