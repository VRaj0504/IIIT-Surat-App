// One-time repair script: rebuilds users/{uid} for every faculty account
// whose Firestore profile got deleted in the full `users` collection wipe
// earlier, without needing each of them to individually sign back into
// the mobile app first.
//
// How it works: lists every real Firebase Auth account, and for each one
// whose email matches an allowlist entry with role == 'faculty', writes
// exactly the same fields onto users/{uid} that AuthContext.ts's signup
// flow would have written for them — department, designation, roleEmail,
// shortForm, name, email, role. Uses set(..., { merge: true }), so it
// only adds/overwrites these specific fields — it will NOT touch or
// delete anything else already on their profile (like officeHours/
// officeLocation/phone a faculty member self-edited via EditProfileScreen)
// if their doc happens to already exist and just needs these fields
// filled back in.
//
// Safe to re-run: for a faculty member whose profile is already correct,
// this just rewrites the same values, changing nothing in practice.
//
// Run: node scripts/fix-faculty-profiles.js

const { initializeApp } = require("firebase-admin/app");
const { cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
const auth = getAuth();

async function listAllAuthUsers() {
  const users = [];
  let nextPageToken;
  do {
    const result = await auth.listUsers(1000, nextPageToken);
    users.push(...result.users);
    nextPageToken = result.pageToken;
  } while (nextPageToken);
  return users;
}

async function main() {
  console.log("Fetching all Auth accounts...");
  const authUsers = await listAllAuthUsers();
  console.log(`Found ${authUsers.length} Auth accounts.`);

  let fixed = 0;
  let skipped = 0;

  for (const authUser of authUsers) {
    const email = (authUser.email || "").toLowerCase();
    if (!email) {
      skipped++;
      continue;
    }

    const allowSnap = await db.collection("allowlist").doc(email).get();
    if (!allowSnap.exists) {
      skipped++;
      continue; // not a faculty allowlist entry — leave students etc. alone
    }
    const allowData = allowSnap.data();
    if (allowData.role !== "faculty") {
      skipped++;
      continue;
    }

    const patch = {
      name: allowData.name,
      email,
      role: "faculty",
      ...(allowData.department ? { department: allowData.department } : {}),
      ...(allowData.designation ? { designation: allowData.designation } : {}),
      ...(allowData.roleEmail ? { roleEmail: allowData.roleEmail } : {}),
      ...(allowData.shortForm ? { shortForm: allowData.shortForm } : {}),
    };

    await db.collection("users").doc(authUser.uid).set(patch, { merge: true });
    console.log(`Fixed: ${email} (${authUser.uid})`);
    fixed++;
  }

  console.log(`\nDone. Fixed ${fixed} faculty profiles, skipped ${skipped} (students/non-faculty/no-email accounts).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  });
