

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DOCTOR = { name: "Dr. Paresh Chhotala", role: "Medical Officer", email: "", phone: "+919824270476" };

const WARDENS = [
  { name: "Dr. Sivavenkateswara Rao V.", role: "Chief Warden", email: "chief.warden@iiitsurat.ac.in", phone: "+916203075101" },
  { name: "Dr. Manish Kumar Rai", role: "Faculty Warden · Boys hostel", email: "manish.rai@iiitsurat.ac.in", phone: "+919161336525" },
  { name: "Dr. Vijay Kumar Patel", role: "Faculty Warden · Boys hostel", email: "vijay.patel@iiitsurat.ac.in", phone: "+919026050579" },
  { name: "Mr. Ketan Parmar", role: "Boys Hostel Warden", email: "ketan.parmar@iiitsurat.ac.in", phone: "+917878394950" },
  { name: "Dr. Khamosh Yadav", role: "Faculty Warden · Girls hostel", email: "khamosh.yadav@iiitsurat.ac.in", phone: "" },
  { name: "Dr. Shikha Maurya", role: "Faculty Warden · Girls hostel", email: "shikha.maurya@iiitsurat.ac.in", phone: "" },
];

const MEDICAL_COMMITTEE = [

];
const HOSTEL_COMMITTEE = [

];

const HELPLINES = [

];

async function main() {
  const doctor = { ...DOCTOR };
  if (!doctor.email) {
    const med = (await db.collection("config").doc("medicalLeave").get()).data();
    if (med?.doctor?.email) {
      doctor.email = med.doctor.email;
      doctor.name = med.doctor.name || doctor.name;
    }
  }
  const all = [doctor, ...WARDENS, ...MEDICAL_COMMITTEE, ...HOSTEL_COMMITTEE];
  const bad = [...all, ...HELPLINES].filter((p) => /REPLACE/.test(JSON.stringify(p)));
  if (bad.length) {
    console.error("Fill in these first:\n" + bad.map((b) => "  " + JSON.stringify(b)).join("\n"));
    process.exit(1);
  }
  const clean = (p) => ({ ...p, email: (p.email || "").trim().toLowerCase(), phone: String(p.phone || "").replace(/\s+/g, "") });

  await db.collection("config").doc("sos").set({
    doctor: clean(doctor),
    wardens: WARDENS.map(clean),
    helplines: HELPLINES.map(clean),
    medicalCommittee: MEDICAL_COMMITTEE.map(clean),
    hostelCommittee: HOSTEL_COMMITTEE.map(clean),

    smsNumbers: Array.from(new Set(all.map((p) => clean(p).phone).filter(Boolean))),
    responderEmails: all.map((p) => clean(p).email).filter(Boolean),
    updatedAt: new Date(),
  });

  for (const w of WARDENS.map(clean).filter((x) => x.email)) {

    const ref = db.collection("allowlist").doc(w.email);
    if (!(await ref.get()).exists) {
      await ref.set({ role: "faculty", name: w.name, department: "HOSTEL", designation: w.role });
    }
  }

  for (const p of all.filter((x) => x.email)) {
    const snap = await db.collection("users").where("email", "==", clean(p).email).limit(1).get();
    if (snap.empty) console.warn(`NOTE: ${p.name} (${p.email}) hasn't signed in to the app yet — no phone alerts until they do.`);
  }
  console.log("config/sos written.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
