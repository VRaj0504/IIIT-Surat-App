const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const APPLY = process.argv.includes("--apply");

const SEM5 = {
  CS504: "Cloud Computing & Big Data Infrastructure",
  HM505: "Innovation & Entrepreneurship",
  CS514: "Fuzzy & Neural Networks",
  EC513: "Hardware Description Languages",
};
const SEM7 = {
  CS701: "Artificial Intelligence",
  CS743: "Deep Learning",
  CS742: "Cyber Security",
  EC761: "Internet of Things",
  CS753: "Computer Ethics & Public Policy",
};
const NAMES = {
  "CSE-5": { CS501: "Data Science", CS502: "Computer Graphics", CS503: "High Performance Computing", ...SEM5 },
  "ECE-5": { EC501: "Wireless Communication", EC502: "Nanoscale Device Engineering", EC503: "Image Processing & Computer Vision", ...SEM5 },
  "CSE-7": { ...SEM7, CS702: "Natural Language Processing" },
  "ECE-7": { ...SEM7, EC702: "Electric Vehicle Technology" },
};

const norm = (c) => String(c || "").replace(/\s+/g, "").toUpperCase();

(async () => {
  const snap = await db.collection("timetable").get();
  let docsChanged = 0;
  let slotsChanged = 0;
  for (const d of snap.docs) {
    const tt = d.data();
    const map = NAMES[`${String(tt.branch).toUpperCase()}-${tt.semester}`];
    if (!map) continue;
    const unknown = new Set();
    const lines = [];
    const days = (tt.days || []).map((day) => ({
      ...day,
      slots: (day.slots || []).map((s) => {
        const code = norm(s.subjectCode);
        const right = map[code];
        if (!right) {
          if (code) unknown.add(code);
          return s;
        }
        if (s.subjectName === right) return s;
        lines.push(`  ${day.day} ${s.startTime}-${s.endTime} ${code}: "${s.subjectName || "(blank)"}" -> "${right}"`);
        return { ...s, subjectName: right };
      }),
    }));
    console.log(`\n${d.id} (${tt.branch} Sem ${tt.semester}, section ${tt.section || "-"})`);
    if (lines.length) lines.forEach((l) => console.log(l));
    else console.log("  already correct");
    if (unknown.size) console.log(`  not in the list, left as is: ${[...unknown].join(", ")}`);
    if (lines.length) {
      docsChanged++;
      slotsChanged += lines.length;
      if (APPLY) await d.ref.update({ days });
    }
  }
  console.log(`\n${slotsChanged} class slot(s) in ${docsChanged} timetable(s) ${APPLY ? "fixed" : "would change"}.`);
  if (!APPLY && slotsChanged) console.log("Run again with --apply to save.");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
