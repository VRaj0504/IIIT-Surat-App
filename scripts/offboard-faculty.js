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
  "shreya.agarwal@iiitsurat.ac.in",
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
