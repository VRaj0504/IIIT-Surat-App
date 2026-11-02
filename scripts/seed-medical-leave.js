const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const OFFICE = {
  name: "Academic Office",
  email: "office@iiitsurat.ac.in",
  designation: "Academic Office",
  teaching: false,
};

const MEDICAL_OFFICER = {
  name: "Dr. Paresh Chhotala",
  email: "medical.officer@iiitsurat.ac.in",
  designation: "Medical Officer",
  teaching: false,
};

const HODS = [
  { department: "CSE", name: "Dr. Ritesh Kumar", email: "riteshkumar@iiitsurat.ac.in" },
  { department: "ECE", name: "Dr. Sudeep Sharma", email: "sudeep.sharma@iiitsurat.ac.in" },
  { department: "MNC", name: "Dr. Anand Pratap Singh", email: "apsingh@iiitsurat.ac.in" },
  { department: "Physical & Applied Sciences", name: "Dr. Nishad Deshpande", email: "nishad.deshpande@iiitsurat.ac.in" },
];

const DEAN = {
  name: "Dr. Kaustubh Dhondge",
  email: "kaustubh.dhondge@iiitsurat.ac.in",
  designation: "Associate Dean",
  teaching: true,
};

const JOINT_REGISTRAR = {
  name: "Shri. Shitalkumar G Bhandarkar",
  email: "joint.registrar@iiitsurat.ac.in",
  designation: "Joint Registrar",
  teaching: false,
};


const isSet = (p) => p && p.email && !p.email.startsWith("REPLACE_") && p.email.toLowerCase().endsWith("@iiitsurat.ac.in");
const lower = (p) => ({ ...p, email: p.email.trim().toLowerCase() });

async function ensureFaculty(p, department) {
  const ref = db.collection("allowlist").doc(p.email);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      role: "faculty",
      name: p.name,
      department,
      designation: p.designation,
      ...(p.teaching === false ? { nonTeaching: true } : {}),
    });
    console.log(`  added ${p.email} to the faculty allowlist${p.teaching === false ? " (non-teaching)" : ""}`);
  } else if (snap.data().role !== "faculty") {
    console.warn(`  WARNING: ${p.email} is on the allowlist but not as faculty — they won't be able to approve.`);
  } else if (p.teaching === false && snap.data().nonTeaching !== true) {
    console.warn(
      `  NOTE: ${p.email} is already on the faculty list as teaching staff, so I left their grade/attendance access alone.` +
        ` If they don't teach, run: node scripts/set-non-teaching.js ${p.email}`,
    );
  }
}

async function main() {
  const hods = HODS.filter(isSet).map(lower);
  if (hods.length === 0) {
    console.error("Add at least one HOD.");
    process.exit(1);
  }
  for (const [label, p] of [["OFFICE", OFFICE], ["MEDICAL_OFFICER", MEDICAL_OFFICER], ["DEAN", DEAN], ["JOINT_REGISTRAR", JOINT_REGISTRAR]]) {
    if (!isSet(p)) {
      console.error(`Set ${label} (name and @iiitsurat.ac.in email) at the top of this file.`);
      process.exit(1);
    }
  }
  const office = lower(OFFICE);
  const mo = lower(MEDICAL_OFFICER);
  const dean = lower(DEAN);
  const jr = lower(JOINT_REGISTRAR);
  const person = (p) => ({ name: p.name, email: p.email });

  const hodByBranch = {};
  for (const h of hods) if (["CSE", "ECE", "MNC"].includes(h.department)) hodByBranch[h.department] = person(h);

  await db.collection("config").doc("medicalLeave").set({
    flow: 2,
    office: person(office),
    medicalOfficer: person(mo),
    hods: hods.map((h) => ({ department: h.department, name: h.name, email: h.email })),
    hodEmails: hods.map((h) => h.email),
    hodByBranch,
    dean: person(dean),
    jr: person(jr),
    lateLimitDays: 4,
    updatedAt: new Date(),
  });

  await ensureFaculty(office, "ADMIN");
  await ensureFaculty(mo, "MEDICAL");
  await ensureFaculty(dean, "ADMIN");
  await ensureFaculty(jr, "ADMIN");
  for (const h of hods) {
    const snap = await db.collection("allowlist").doc(h.email).get();
    if (!snap.exists) console.warn(`  WARNING: HOD ${h.email} is not on the faculty allowlist, so they can't sign yet.`);
  }

  console.log("\nMedical leave process saved:");
  console.log(`  1. Student submits the form with reports -> Academic Office <${office.email}>`);
  console.log(`  2. Office checks and forwards -> Medical Officer ${mo.name} <${mo.email}>`);
  console.log(`  3. After the Medical Officer approves, these sign in any order:`);
  console.log(`       HOD (student picks): ${hods.map((h) => `${h.name} (${h.department})`).join(", ")}`);
  console.log(`       Associate Dean: ${dean.name} <${dean.email}>`);
  console.log(`       Joint Registrar: ${jr.name} <${jr.email}>`);
  console.log("  4. All approve -> classes in those dates count as present; signed form and bundle saved.");
  console.log("  The office and Medical Officer sign in to the faculty portal with these emails.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
