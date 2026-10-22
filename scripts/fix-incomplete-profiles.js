

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
initializeApp({ credential: cert(require("./serviceAccountKey.json")) });
const db = getFirestore();
const APPLY = process.argv.includes("--apply");

async function main() {
  const users = await db.collection("users").get();
  let bad = 0, fixable = 0, fixed = 0;
  for (const u of users.docs) {
    const p = u.data();
    if (p.role !== "student") continue;
    if (p.branch && p.section && p.admissionYear) continue;
    bad++;
    const reg = String(p.enrollmentNumber || "").trim().toUpperCase();
    const rs = reg ? await db.collection("roster").doc(reg).get() : null;
    const r = rs && rs.exists ? rs.data() : null;
    const missing = ["branch", "section", "admissionYear"].filter((k) => !p[k]).join(", ");
    if (!r) {
      console.log(`✗ ${p.name} <${p.email}> reg=${reg || "(none)"} — missing ${missing}; NOT in roster, add them to the roster first`);
      continue;
    }
    const patch = {};
    for (const k of ["branch", "section", "admissionYear", "specialization", "program"]) {
      if (!p[k] && r[k]) patch[k] = r[k];
    }
    if (!patch.branch && !p.branch || !patch.section && !p.section || !patch.admissionYear && !p.admissionYear) {
      console.log(`✗ ${p.name} <${p.email}> reg=${reg} — roster entry is itself missing ${missing}; fix it in the portal Roster tab`);
      continue;
    }
    fixable++;
    console.log(`${APPLY ? "→ fixing" : "• can fix"} ${p.name} <${p.email}> reg=${reg}: ${JSON.stringify(patch)}`);
    if (APPLY) {
      await u.ref.update(patch);
      fixed++;
    }
  }
  console.log(`\n${bad} student profile(s) incomplete, ${fixable} fixable from the roster${APPLY ? `, ${fixed} fixed` : " (run with --apply)"}.`);
}
main().then(() => process.exit(0));
