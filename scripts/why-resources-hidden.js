const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const email = (process.argv[2] || "").trim().toLowerCase();

const ayStart = (d = new Date()) => (d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1);
const currentAY = () => `${ayStart()}-${String((ayStart() + 1) % 100).padStart(2, "0")}`;
const semesterFor = (admissionYear, program) => {
  const now = new Date();
  const odd = now.getMonth() + 1 >= 7;
  const idx = odd ? now.getFullYear() - admissionYear : now.getFullYear() - admissionYear - 1;
  const s = idx * 2 + 1 + (odd ? 0 : 1);
  return Math.min(Math.max(s, 1), program === "PG" ? 4 : 8);
};
const resYear = (r) => {
  if (r.academicYear) return String(r.academicYear);
  const d = r.createdAt?.toDate?.();
  return d ? `${ayStart(d)}-${String((ayStart(d) + 1) % 100).padStart(2, "0")}` : null;
};

async function main() {
  if (!email) {
    console.error("Usage: node scripts/why-resources-hidden.js student@iiitsurat.ac.in");
    process.exit(1);
  }
  const u = await db.collection("users").where("email", "==", email).limit(1).get();
  if (u.empty) {
    console.error("No app account with that email.");
    process.exit(1);
  }
  const p = u.docs[0].data();
  const sem = semesterFor(p.admissionYear, p.program);
  console.log(`Student: ${p.name} <${email}>`);
  console.log(`  role=${p.role} branch=${p.branch} section=${JSON.stringify(p.section ?? null)} admissionYear=${p.admissionYear} program=${p.program ?? "UG"} -> Sem ${sem}, year ${currentAY()}\n`);
  if (p.role === "faculty") console.log("  NOTE: role is faculty, so the app shows the faculty view, not the class view.\n");

  const snap = await db.collection("resources").where("branch", "==", p.branch).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const near = rows.filter((r) => Number(r.semester) === sem || String(r.semester) === String(sem));
  console.log(`${p.branch} resources in total: ${rows.length}; tagged Sem ${sem}: ${near.length}\n`);

  for (const r of near.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))) {
    const why = [];
    if (typeof r.semester !== "number") why.push(`semester saved as ${typeof r.semester} "${r.semester}"`);
    if (r.section && r.section !== p.section) why.push(`section "${r.section}" is not the student's "${p.section}"`);
    if (r.type !== "PYQ" && resYear(r) && resYear(r) !== currentAY()) why.push(`visible only in ${resYear(r)}`);
    if (!r.createdAt) why.push("no createdAt (the app's query sorts by it)");
    console.log(`${why.length ? "HIDDEN " : "shown  "} "${r.title}" · ${r.subject ?? "-"} · ${r.type} · section ${JSON.stringify(r.section ?? null)} · ${resYear(r)}`);
    why.forEach((w) => console.log(`         -> ${w}`));
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
