

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DOCTOR = {
  name: "Dr. Rachit Nimavat",
  email: "rachit.nimavat@iiitsurat.ac.in",
  designation: "Medical Officer",
};

const DR = {
  name: "REPLACE_DR_NAME",
  email: "REPLACE_DR_EMAIL@iiitsurat.ac.in",
  designation: "Deputy Registrar (Academics)",
};

const DEAN = {
  name: "REPLACE_DEAN_NAME",
  email: "REPLACE_DEAN_EMAIL@iiitsurat.ac.in",
  designation: "Dean (Academics)",
};

const HOD_BY_BRANCH = {
  CSE: { name: "Dr. Ritesh Kumar", email: "riteshkumar@iiitsurat.ac.in" },
  ECE: { name: "Dr. Sudeep Sharma", email: "sudeep.sharma@iiitsurat.ac.in" },
  MNC: { name: "Dr. Anand Pratap Singh", email: "apsingh@iiitsurat.ac.in" },
};

async function main() {
  if (DOCTOR.email.startsWith("REPLACE_")) {
    console.error("Set DOCTOR.email to the doctor's real institute email first.");
    process.exit(1);
  }
  const lower = (o) => ({ ...o, email: o.email.trim().toLowerCase() });
  const doctor = lower(DOCTOR);
  const hods = Object.fromEntries(Object.entries(HOD_BY_BRANCH).map(([b, h]) => [b, lower(h)]));
  const isSet = (p) => p.email && !p.email.startsWith("REPLACE_") && p.email.endsWith("@iiitsurat.ac.in");
  const dr = isSet(DR) ? lower(DR) : null;
  const dean = isSet(DEAN) ? lower(DEAN) : null;

  await db.collection("config").doc("medicalLeave").set({
    doctor: { name: doctor.name, email: doctor.email },
    ...(dr ? { dr: { name: dr.name, email: dr.email } } : {}),
    ...(dean ? { dean: { name: dean.name, email: dean.email } } : {}),
    hodByBranch: hods,
    updatedAt: new Date(),
  });

  const ensureFaculty = async (p, department) => {
    const ref = db.collection("allowlist").doc(p.email);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ role: "faculty", name: p.name, department, designation: p.designation });
      console.log(`Added ${p.email} to the faculty allowlist.`);
    } else if (snap.data().role !== "faculty") {
      console.warn(`WARNING: ${p.email} is on the allowlist but not as faculty — they won't be able to approve.`);
    }
  };
  await ensureFaculty(doctor, "MEDICAL");
  if (dr) await ensureFaculty(dr, "ADMIN");
  if (dean) await ensureFaculty(dean, "ADMIN");

  for (const [branch, h] of Object.entries(hods)) {
    const snap = await db.collection("allowlist").doc(h.email).get();
    if (!snap.exists) console.warn(`WARNING: ${branch} HOD ${h.email} is not on the allowlist.`);
  }

  console.log("Medical leave chain saved:");
  console.log(`  Doctor: ${doctor.name} <${doctor.email}>`);
  console.log(dr ? `  Deputy Registrar: ${dr.name} <${dr.email}>` : "  Deputy Registrar: not set yet (step skipped)");
  console.log(dean ? `  Dean: ${dean.name} <${dean.email}>` : "  Dean: not set yet (step skipped)");
  for (const [b, h] of Object.entries(hods)) console.log(`  ${b} HOD: ${h.name} <${h.email}>`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});