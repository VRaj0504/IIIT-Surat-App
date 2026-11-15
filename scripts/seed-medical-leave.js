const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DOCTOR = {
  name: "REPLACE_DOCTOR_NAME",
  email: "REPLACE_DOCTOR_EMAIL@iiitsurat.ac.in",
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

const ADMINISTRATOR = {
  name: "Shri. Kartik Patel",
  email: "kartikp@iiitsurat.ac.in",
  designation: "Administrator",
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
  if (!isSet(DOCTOR)) {
    console.error("Set DOCTOR.name and DOCTOR.email at the top of this script first.");
    process.exit(1);
  }
  const hods = HODS.filter(isSet).map(lower);
  if (hods.length === 0) {
    console.error("Add at least one HOD.");
    process.exit(1);
  }
  const doctor = lower(DOCTOR);
  const dean = isSet(DEAN) ? lower(DEAN) : null;
  const jr = isSet(JUNIOR_REGISTRAR) ? lower(JUNIOR_REGISTRAR) : null;
  const administrator = isSet(ADMINISTRATOR) ? lower(ADMINISTRATOR) : null;
  const person = (p) => ({ name: p.name, email: p.email });

  const ref = db.collection("config").doc("medicalLeave");
  const existing = (await ref.get()).data() ?? {};
  const hodByBranch = { ...(existing.hodByBranch ?? {}) };
  for (const h of hods) if (["CSE", "ECE", "MNC"].includes(h.department)) hodByBranch[h.department] = person(h);

  await ref.set({
    doctor: person(doctor),
    hods: hods.map((h) => ({ department: h.department, name: h.name, email: h.email })),
    hodEmails: hods.map((h) => h.email),
    hodByBranch,
    ...(dean ? { dean: person(dean) } : {}),
    ...(jr ? { jr: person(jr) } : {}),
    ...(administrator ? { administrator: person(administrator) } : {}),
    updatedAt: new Date(),
  });

  await ensureFaculty(doctor, "MEDICAL");
  if (dean) await ensureFaculty(dean, "ADMIN");
  if (jr) await ensureFaculty(jr, "ADMIN");
  if (administrator) await ensureFaculty(administrator, "ADMIN");
  for (const h of hods) {
    const snap = await db.collection("allowlist").doc(h.email).get();
    if (!snap.exists) console.warn(`  WARNING: HOD ${h.email} is not on the faculty allowlist, so they can't approve yet.`);
  }

  console.log("\nMedical leave chain saved:");
  console.log(`  1. Doctor: ${doctor.name} <${doctor.email}>`);
  console.log(`  2. HOD (student picks): ${hods.map((h) => `${h.name} (${h.department})`).join(", ")}`);
  console.log(dean ? `  3. Dean: ${dean.name} <${dean.email}>` : "  3. Dean: not set yet (step skipped)");
  console.log(jr ? `  4. Junior Registrar: ${jr.name} <${jr.email}>` : "  4. Junior Registrar: not set yet (step skipped)");
  console.log(
    administrator ? `  5. Administrator: ${administrator.name} <${administrator.email}>` : "  5. Administrator: not set yet (step skipped)",
  );
  console.log("  Then: classes in those dates count as present; each teacher can still change it.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
