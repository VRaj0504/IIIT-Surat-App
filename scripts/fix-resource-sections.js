const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const apply = process.argv.includes("--apply");
const setArg = process.argv.find((a) => a.startsWith("--set="));
const setTo = setArg ? setArg.slice(6).trim() : null;

const startOf = (ay) => {
  const m = String(ay || "").match(/^(\d{4})/);
  if (m) return Number(m[1]);
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
};
const yearFor = (sem, ay) => startOf(ay) - Math.floor((Number(sem) - 1) / 2);

async function main() {
  const [roster, resources] = await Promise.all([db.collection("roster").get(), db.collection("resources").get()]);

  const classes = new Map();
  roster.docs.forEach((d) => {
    const r = d.data();
    if (r.program === "PG" || /^PG/i.test(d.id)) return;
    if (!r.branch || typeof r.admissionYear !== "number") return;
    const key = `${r.branch}|${r.admissionYear}`;
    const c = classes.get(key) || { sections: new Map(), none: 0 };
    const sec = String(r.section || "").trim();
    if (sec) c.sections.set(sec, (c.sections.get(sec) || 0) + 1);
    else c.none++;
    classes.set(key, c);
  });

  console.log("Sections in the roster (UG):");
  [...classes.keys()].sort((a, b) => b.split("|")[1] - a.split("|")[1] || a.localeCompare(b)).forEach((k) => {
    const [branch, year] = k.split("|");
    const c = classes.get(k);
    const list = [...c.sections.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([s, n]) => `${s} (${n})`);
    console.log(`  ${year} batch ${branch}: ${list.join(", ") || "no sections"}${c.none ? `, no section (${c.none})` : ""}`);
  });

  const bad = [];
  resources.docs.forEach((d) => {
    const r = d.data();
    const sec = r.section == null ? "" : String(r.section).trim();
    if (!sec) return;
    const year = yearFor(r.semester, r.academicYear);
    const c = classes.get(`${r.branch}|${year}`);
    if (!c || !c.sections.has(sec)) bad.push({ ref: d.ref, title: r.title, branch: r.branch, semester: r.semester, section: sec, year, valid: c ? [...c.sections.keys()] : [] });
  });

  console.log(`\nResources whose section matches no student: ${bad.length}`);
  bad.forEach((b) => console.log(`  "${b.title}" · ${b.branch} Sem ${b.semester} · section ${b.section} (real sections: ${b.valid.join(", ") || "none"})`));
  if (!bad.length) return;

  if (!apply) {
    console.log("\nDry run. Nothing changed.");
    console.log("Make them visible to the whole class:   node scripts/fix-resource-sections.js --apply");
    console.log("Or move them to one section:            node scripts/fix-resource-sections.js --apply --set=CSE2");
    return;
  }

  let done = 0;
  for (const b of bad) {
    if (setTo && !b.valid.includes(setTo)) {
      console.log(`  skipped "${b.title}": ${setTo} is not a section of ${b.branch} Sem ${b.semester}`);
      continue;
    }
    await b.ref.update({ section: setTo || null });
    done++;
  }
  console.log(`\nUpdated ${done} resource(s) to ${setTo ? `section ${setTo}` : "all sections"}.`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
