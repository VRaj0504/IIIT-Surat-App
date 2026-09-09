// One-time / re-run-as-needed script to add extra lead emails to clubs
// that have more than one lead. Sets `additionalLeadEmails` (an array)
// on each matched club — this is separate from the original single
// `leadEmail` field (which still controls in-app edit permissions,
// untouched by this script) and is only used by the email-posting
// pipeline (ingestFacultyEmail.ts) to recognize more than one sender per
// club. Safe to re-run any time the list changes — each run fully
// replaces `additionalLeadEmails` for the clubs listed below with
// exactly what's here, so remove a name from the list here if that
// person stops being a lead.
//
// Fill in real club names (must match Firestore exactly — same names
// used in scripts/clubs.mjs) and real emails before running.

const { initializeApp } = require("firebase-admin/app");
const { cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

// clubName -> array of EXTRA leads (don't repeat the primary lead here,
// this is only for the additional ones). Each entry needs both a name
// (for display, via formatClubLeads in clubsService.ts) and an email
// (for matching in ingestFacultyEmail.ts).
const EXTRA_LEADS = {
  "SARAS": [
    { name: "Jitesh Singh", email: "ui24cs34@iiitsurat.ac.in" },
    { name: "Rishit Nagar", email: "ui24ec57@iiitsurat.ac.in" },
  ],
  "Google Developers Group (GDG) IIIT Surat": [
    { name: "Borra Moneeshwar", email: "ui24ec13@iiitsurat.ac.in" },
  ],
  "Exposure (Photography Club)": [
    { name: "Parth Gupta", email: "ui24cs57@iiitsurat.ac.in" },
    { name: "Divyanshu Meena", email: "ui24cs22@iiitsurat.ac.in" },
  ],
  "Cineworks (Videography Club)": [
    { name: "Divyanshu Meena", email: "ui24cs22@iiitsurat.ac.in" },
  ],
  "Groove (Dance Club)": [
    { name: "Apekshaa Yadav", email: "ui24cs84@iiitsurat.ac.in" },
  ],
  "Abstract (Art and Design Club)": [
    { name: "Apekshaa Yadav", email: "ui24cs84@iiitsurat.ac.in" },
  ],
  "Indominous Club": [
    { name: "Jatin Gajraj", email: "ui24ec30@iiitsurat.ac.in" },
  ],
  "Management (Cultural Club Core Team)": [
    { name: "Yuvraj Dhingra", email: "ui24cs86@iiitsurat.ac.in" },
    { name: "Jeels Hapani", email: "ui24cs29@iiitsurat.ac.in" },
    { name: "Dhruvraj Singh", email: "ui24cs21@iiitsurat.ac.in" },
  ],
  "Swarang (Singing Club)": [
    { name: "Sooryansh Verma", email: "ui24ec61@iiitsurat.ac.in" },
  ],
};

async function main() {
  const entries = Object.entries(EXTRA_LEADS);
  if (entries.length === 0) {
    console.log("EXTRA_LEADS is empty — fill it in with real club names and emails first.");
    process.exit(0);
  }

  for (const [clubName, leads] of entries) {
    const snap = await db.collection("clubs").where("name", "==", clubName).get();
    if (snap.empty) {
      console.log(`NOT FOUND — skipped: ${clubName}`);
      continue;
    }
    if (snap.size > 1) {
      console.log(`AMBIGUOUS (${snap.size} matches) — skipped: ${clubName}`);
      continue;
    }
    const additionalLeadNames = leads.map((l) => l.name);
    const additionalLeadEmails = leads.map((l) => l.email.trim().toLowerCase());
    await snap.docs[0].ref.update({ additionalLeadNames, additionalLeadEmails });
    console.log(`updated  ${clubName} -> ${additionalLeadNames.join(", ")} [${additionalLeadEmails.join(", ")}]`);
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err.message ?? err);
  process.exit(1);
});