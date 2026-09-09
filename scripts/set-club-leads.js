// One-time / re-run-as-needed script to set the real, primary
// leadName/leadEmail on existing club documents. Unlike clubs.mjs (which
// only CREATES clubs that don't exist yet and skips ones that do), this
// UPDATES the fields directly — the right tool once the clubs already
// exist and just need their placeholder test-xxx@ emails replaced with
// real ones.
//
// Any name still literally containing "placeholder-" needs a real email
// filled in by hand before it's usable — those are the leads whose email
// wasn't provided yet.

const { initializeApp } = require("firebase-admin/app");
const { cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

// clubName -> { leadName, leadEmail } — the PRIMARY lead only (the one
// who also gets in-app edit permissions via leadUid). Any additional
// leads for the same club go in set-club-extra-leads.js instead.
const LEADS = {
  "SARAS": { leadName: "Abhinav Prakash", leadEmail: "ui24ec01@iiitsurat.ac.in" },
  "Modern Automation and Robotics Club (MARC)": { leadName: "Anshuman Maurya", leadEmail: "ui24ec09@iiitsurat.ac.in" },
  "Learn Code Solve (LCS)": { leadName: "Mahir Dalal", leadEmail: "ui24cs18@iiitsurat.ac.in" },
  "Google Developers Group (GDG) IIIT Surat": { leadName: "Aditya Nath Tyagi", leadEmail: "ui24ec03@iiitsurat.ac.in" },
  "Exposure (Photography Club)": { leadName: "Rachit Singh", leadEmail: "ui24cs67@iiitsurat.ac.in" },
  "Cineworks (Videography Club)": { leadName: "Parth Gupta", leadEmail: "ui24cs57@iiitsurat.ac.in" },
  "Malhar (Drama Club)": { leadName: "Vikas Poonia", leadEmail: "ui24ec65@iiitsurat.ac.in" },
  "Groove (Dance Club)": { leadName: "Tanisha", leadEmail: "ui24ec63@iiitsurat.ac.in" },
  "Antra (Poetry Club)": { leadName: "Arun", leadEmail: "ui24cs11@iiitsurat.ac.in" },
  "Abstract (Art and Design Club)": { leadName: "Divya", leadEmail: "ui24ec45@iiitsurat.ac.in" },
  "Indominous Club": { leadName: "Akash Kumar", leadEmail: "ui24ec04@iiitsurat.ac.in" },
  "Ruminate (E-Cell of IIIT Surat)": { leadName: "Nityam Dave", leadEmail: "ui24cs52@iiitsurat.ac.in" },
  "Management (Cultural Club Core Team)": { leadName: "Raman Gupta", leadEmail: "ui24cs68@iiitsurat.ac.in" },
  "Swarang (Singing Club)": { leadName: "Akshita Shukla", leadEmail: "ui24cs06@iiitsurat.ac.in" },
};

async function main() {
  for (const [clubName, lead] of Object.entries(LEADS)) {
    const snap = await db.collection("clubs").where("name", "==", clubName).get();
    if (snap.empty) {
      console.log(`NOT FOUND — skipped: ${clubName}`);
      continue;
    }
    if (snap.size > 1) {
      console.log(`AMBIGUOUS (${snap.size} matches) — skipped: ${clubName}`);
      continue;
    }
    const email = lead.leadEmail.trim().toLowerCase();

    // Same "link if an account already exists" logic as clubs.mjs's
    // createClub — if this lead has already signed up, leadUid gets set
    // now instead of waiting for claimPendingClubLead to catch it later.
    const userSnap = await db.collection("users").where("email", "==", email).limit(1).get();
    const leadUid = userSnap.empty ? null : userSnap.docs[0].id;

    await snap.docs[0].ref.update({
      leadName: lead.leadName,
      leadEmail: email,
      leadUid,
    });
    const flag = email.startsWith("placeholder-") ? "  [PLACEHOLDER EMAIL — fix before relying on this]" : "";
    console.log(`updated  ${clubName} -> ${lead.leadName} <${email}>${flag}`);
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err.message ?? err);
  process.exit(1);
});