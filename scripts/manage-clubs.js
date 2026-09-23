// One script for every club change — replaces clubs.mjs,
// set-club-leads.js, set-club-extra-leads.js, set-club-parents.js, and
// seed-indominous-subclubs.js, which all touched the same `clubs`
// collection from five different places (one to create a club, a
// different one to set its real lead, a third for extra leads, a fourth
// for nesting under a parent). That meant one real change — like adding
// a new club with a lead — meant editing and running up to three files
// in the right order. Everything now lives in one CLUBS object below;
// edit an entry and re-run this one script.
//
// Uses the admin SDK (serviceAccountKey.json), same as the old
// set-club-*.js scripts — bypasses auth/security rules entirely, so
// unlike the old clubs.mjs there's no FACULTY_EMAIL/FACULTY_PASSWORD or
// --env-file needed. Just:
//
//   node manage-clubs.js
//
// Safe to re-run any time — every club is created if missing, or
// updated in place if it already exists (the old clubs.mjs used to
// SKIP existing clubs entirely, so editing a description or fixing a
// lead's email after creation silently did nothing unless you knew to
// use a different script; this always applies what's below).
//
// Parents are resolved by name in a second pass, so a sub-club can list
// its parent's exact name below without worrying about lookup order.

const { initializeApp } = require("firebase-admin/app");
const { cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// name -> {
//   category, description,
//   leadName, leadEmail?,             (leadEmail omitted = name-only lead, no account link/permissions)
//   extraLeads?: [{ name, email? }],  (co-leads; email optional per person, same name-only rule)
//   parent?: "Exact Parent Club Name",
// }
const CLUBS = {
  // ---------------- Cultural (mother club: SARAS) ----------------
  "SARAS": {
    category: "Cultural",
    description: "Cultural club of IIIT Surat.",
    leadName: "Abhinav Prakash", leadEmail: "ui24ec01@iiitsurat.ac.in",
  },
  "Abstract (Art and Design Club)": {
    category: "Cultural", description: "Art and design club under SARAS.", parent: "SARAS",
    leadName: "Divya", leadEmail: "ui24ec45@iiitsurat.ac.in",
    extraLeads: [{ name: "Apekshaa Yadav", email: "ui24cs84@iiitsurat.ac.in" }],
  },
  "Antra (Poetry Club)": {
    category: "Cultural", description: "Poetry club under SARAS.", parent: "SARAS",
    leadName: "Arun", leadEmail: "ui24cs11@iiitsurat.ac.in",
  },
  "Swarang (Singing Club)": {
    category: "Cultural", description: "Singing club under SARAS.", parent: "SARAS",
    leadName: "Akshita Shukla", leadEmail: "ui24cs06@iiitsurat.ac.in",
    extraLeads: [{ name: "Sooryansh Verma", email: "ui24ec61@iiitsurat.ac.in" }],
  },
  "Malhar (Drama Club)": {
    category: "Cultural", description: "Drama club under SARAS.", parent: "SARAS",
    leadName: "Vikas Poonia", leadEmail: "ui24ec65@iiitsurat.ac.in",
  },
  "Groove (Dance Club)": {
    category: "Cultural", description: "Dance club under SARAS.", parent: "SARAS",
    leadName: "Tanisha", leadEmail: "ui24ec63@iiitsurat.ac.in",
    extraLeads: [{ name: "Apekshaa Yadav", email: "ui24cs84@iiitsurat.ac.in" }],
  },
  "Cineworks (Videography Club)": {
    category: "Cultural", description: "Videography club under SARAS.", parent: "SARAS",
    leadName: "Parth Gupta", leadEmail: "ui24cs57@iiitsurat.ac.in",
    extraLeads: [{ name: "Divyanshu Meena", email: "ui24cs22@iiitsurat.ac.in" }],
  },
  "Exposure (Photography Club)": {
    category: "Cultural", description: "Photography club under SARAS.", parent: "SARAS",
    leadName: "Rachit Singh", leadEmail: "ui24cs67@iiitsurat.ac.in",
    extraLeads: [
      { name: "Parth Gupta", email: "ui24cs57@iiitsurat.ac.in" },
      { name: "Divyanshu Meena", email: "ui24cs22@iiitsurat.ac.in" },
    ],
  },
  "Management (Cultural Club Core Team)": {
    category: "Cultural", description: "Core organizing team for SARAS and its cultural clubs.", parent: "SARAS",
    leadName: "Raman Gupta", leadEmail: "ui24cs68@iiitsurat.ac.in",
    extraLeads: [
      { name: "Yuvraj Dhingra", email: "ui24cs86@iiitsurat.ac.in" },
      { name: "Jeels Hapani", email: "ui24cs29@iiitsurat.ac.in" },
      { name: "Dhruvraj Singh", email: "ui24cs21@iiitsurat.ac.in" },
    ],
  },

  // ---------------- Technical ----------------
  "Google Developers Group (GDG) IIIT Surat": {
    category: "Technical",
    description: "Student-led developer community supported by Google; workshops, hackathons, and project-based learning.",
    leadName: "Aditya Nath Tyagi", leadEmail: "ui24ec03@iiitsurat.ac.in",
    extraLeads: [{ name: "Borra Moneeshwar", email: "ui24ec13@iiitsurat.ac.in" }],
  },
  "Modern Automation and Robotics Club (MARC)": {
    category: "Technical", description: "Robotics club of IIIT Surat.",
    leadName: "Anshuman Maurya", leadEmail: "ui24ec09@iiitsurat.ac.in",
  },
  "Learn Code Solve (LCS)": {
    category: "Coding", description: "Coding and competitive programming club of IIIT Surat.",
    leadName: "Mahir Dalal", leadEmail: "ui24cs18@iiitsurat.ac.in",
  },
  "Inspire": {
    category: "Spritual", description: "Spritual club of IIIT Surat.",
    // Email derived from the "UI24EC68" enrollment number following the
    // ui24<branch><roll>@iiitsurat.ac.in pattern every other real lead
    // below uses — not given as a literal email, confirm before relying on it.
    leadName: "Yashvardhan Gautam", leadEmail: "ui24ec68@iiitsurat.ac.in",
  },

  // ---------------- Entrepreneur ----------------
  "Ruminate": {
    category: "Entrepreneur", description: "Entrepreneurship cell of IIIT Surat, founded 2019.",
    leadName: "Nityam Dave", leadEmail: "ui24cs52@iiitsurat.ac.in",
  },

  // ---------------- Academic ----------------
  // Both still carry a placeholder test-*@iiitsurat.ac.in email — nobody's
  // given a real lead for these two yet. Fill in leadEmail here once known.
  "Ramanujan Mathematics Club (RMC)": {
    category: "Academic", description: "Mathematics-focused club for problem-solving and analytical thinking.",
    leadName: "Parth Acharya (President)", leadEmail: "ui24cs56@iiitsurat.ac.in",
  },
  "ASTRA": {
    category: "Academic", description: "Astronomy and astrophysics club of IIIT Surat.",
    leadName: "TBD", leadEmail: "test-astra@iiitsurat.ac.in",
  },

  // ---------------- Sports (mother club: Indominous Club) ----------------
  "Indominous Club": {
    category: "Sports", description: "Sports club of IIIT Surat.",
    leadName: "Akash Kumar", leadEmail: "ui24ec04@iiitsurat.ac.in",
    extraLeads: [{ name: "Jatin Gajraj", email: "ui24ec30@iiitsurat.ac.in" }],
  },
  // Indominous sub-clubs — every head below is name-only on purpose (no
  // leadEmail/extraLeads email), same reasoning as the old
  // seed-indominous-subclubs.js: display via formatClubLeads() in
  // clubsService.ts, no in-app edit permissions, no email-posting access
  // via ingestFacultyEmail.ts. Add a real email to any of these the same
  // way the clubs above do it if a head later needs real posting access.
  "Cricket": { category: "Sports", description: "Cricket team under Indominous Club.", parent: "Indominous Club", leadName: "Avanish Kumar", extraLeads: [{ name: "Abhishek" }] },
  "Volleyball": { category: "Sports", description: "Volleyball team under Indominous Club.", parent: "Indominous Club", leadName: "Vikash Pooniya", extraLeads: [{ name: "Nanda Kishore" }] },
  "Kabaddi": { category: "Sports", description: "Kabaddi team under Indominous Club.", parent: "Indominous Club", leadName: "Vivek" },
  "Football": { category: "Sports", description: "Football team under Indominous Club.", parent: "Indominous Club", leadName: "Pragyan Sharma" },
  "eSports": { category: "Sports", description: "eSports team under Indominous Club.", parent: "Indominous Club", leadName: "Annan", extraLeads: [{ name: "Harshit Dwivedi" }] },
  "Indoor Games": { category: "Sports", description: "Indoor games team under Indominous Club.", parent: "Indominous Club", leadName: "Shrimal Patel", extraLeads: [{ name: "Dhruvraj Singh" }] },
  "Kho-Kho": { category: "Sports", description: "Kho-Kho team under Indominous Club.", parent: "Indominous Club", leadName: "Prakashsevada", extraLeads: [{ name: "Badrinath" }] },
  "Basketball": { category: "Sports", description: "Basketball team under Indominous Club.", parent: "Indominous Club", leadName: "Abhinav Prakash" },
  "Athletics": { category: "Sports", description: "Athletics team under Indominous Club.", parent: "Indominous Club", leadName: "Jadav Siddu" },
  "Badminton": { category: "Sports", description: "Badminton team under Indominous Club.", parent: "Indominous Club", leadName: "Mayank Sachdev" },
  "PR": { category: "Sports", description: "Public relations team for Indominous Club.", parent: "Indominous Club", leadName: "Parth Mahajan", extraLeads: [{ name: "Mayank Sachdev" }] },
  "Design": { category: "Sports", description: "Chief design lead for Indominous Club.", parent: "Indominous Club", leadName: "Om Sahoo" },
  "Content": { category: "Sports", description: "Content team for Indominous Club.", parent: "Indominous Club", leadName: "Yuvi" },
  "Media": { category: "Sports", description: "Media team for Indominous Club.", parent: "Indominous Club", leadName: "Raman Gupta", extraLeads: [{ name: "Divyanshu Meena" }] },
  "Girls Coordination": { category: "Sports", description: "Girls' coordination team for Indominous Club.", parent: "Indominous Club", leadName: "Aashi Rajput", extraLeads: [{ name: "Akshita Shukla" }, { name: "Tanisha Rathore" }] },
};

async function findByName(name) {
  const snap = await db.collection("clubs").where("name", "==", name).get();
  if (snap.size > 1) throw new Error(`AMBIGUOUS — ${snap.size} clubs named "${name}"`);
  return snap.empty ? null : snap.docs[0];
}

async function resolveLeadUid(email) {
  if (!email) return null;
  const snap = await db.collection("users").where("email", "==", email.trim().toLowerCase()).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

async function main() {
  let created = 0;
  let updated = 0;
  const placeholders = [];

  // Pass 1: create or update every club, without parentClubId yet — a
  // sub-club's parent needs to exist (and have a real doc ID) first.
  for (const [name, club] of Object.entries(CLUBS)) {
    const leadEmail = club.leadEmail ? club.leadEmail.trim().toLowerCase() : null;
    const data = {
      name,
      category: club.category,
      description: club.description,
      leadName: club.leadName,
      leadEmail,
      leadUid: await resolveLeadUid(leadEmail),
      ...(club.extraLeads
        ? {
            additionalLeadNames: club.extraLeads.map((l) => l.name),
            ...(club.extraLeads.some((l) => l.email)
              ? { additionalLeadEmails: club.extraLeads.map((l) => (l.email ?? "").trim().toLowerCase()) }
              : {}),
          }
        : {}),
    };

    if (leadEmail && leadEmail.startsWith("test-")) placeholders.push(name);

    const existing = await findByName(name);
    if (existing) {
      await existing.ref.update(data);
      console.log(`updated  ${name} -> ${club.leadName}`);
      updated++;
    } else {
      await db.collection("clubs").add({ ...data, createdAt: FieldValue.serverTimestamp() });
      console.log(`created  ${name} -> ${club.leadName}`);
      created++;
    }
  }

  // Pass 2: resolve and set parentClubId for anything that declared one.
  for (const [name, club] of Object.entries(CLUBS)) {
    if (!club.parent) continue;
    const parentDoc = await findByName(club.parent);
    if (!parentDoc) {
      console.log(`PARENT NOT FOUND for ${name} -> "${club.parent}"`);
      continue;
    }
    const childDoc = await findByName(name);
    await childDoc.ref.update({ parentClubId: parentDoc.id });
  }

  console.log(`\nDone. Created ${created}, updated ${updated}.`);
  if (placeholders.length > 0) {
    console.log(`\nStill on a placeholder test-*@iiitsurat.ac.in email (no real lead set yet):`);
    placeholders.forEach((n) => console.log(`  - ${n}`));
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err.message ?? err);
  process.exit(1);
});
