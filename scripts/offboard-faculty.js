// Fully removes a faculty member who's left the institute — not just
// their allowlist entry (which seed-allowlist.js already handles once
// their line is deleted from there), but their actual account: the
// users/{uid} Firestore profile (what makes them show up in Faculty
// Directory) AND the Firebase Auth account itself (so they genuinely
// can't sign back in, not just "no profile if they did").
//
// Edit EMAILS_TO_OFFBOARD below, then run: node offboard-faculty.js
// Safe to re-run — anyone already removed is just skipped.

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

const EMAILS_TO_OFFBOARD = [
  "shreya.agarwal@iiitsurat.ac.in", // left the institute
];

async function main() {
  for (const email of EMAILS_TO_OFFBOARD) {
    console.log(`\n${email}:`);

    let authUser;
    try {
      authUser = await auth.getUserByEmail(email);
    } catch {
      console.log("  no Auth account found (already removed, or never signed up)");
    }

    if (authUser) {
      const userDoc = await db.collection("users").doc(authUser.uid).get();
      if (userDoc.exists) {
        await userDoc.ref.delete();
        console.log(`  deleted users/${authUser.uid} profile`);
      } else {
        console.log("  no Firestore profile doc found (nothing to delete there)");
      }

      await auth.deleteUser(authUser.uid);
      console.log(`  deleted Auth account (${authUser.uid}) — can no longer sign in`);
    }

    // Also clean up the allowlist entry if it's still there for some
    // reason (normally you'd have already removed their line from
    // seed-allowlist.js and re-run it, but this covers the case where
    // that hasn't happened yet).
    const allowDoc = await db.collection("allowlist").doc(email).get();
    if (allowDoc.exists) {
      await allowDoc.ref.delete();
      console.log("  deleted lingering allowlist entry");
    }
  }

  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err.message ?? err);
    process.exit(1);
  });
