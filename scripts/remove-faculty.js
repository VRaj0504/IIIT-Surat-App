const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email.includes("@")) {
    console.error("Usage: node scripts/remove-faculty.js name@iiitsurat.ac.in");
    process.exit(1);
  }
  const allow = db.collection("allowlist").doc(email);
  if ((await allow.get()).exists) {
    await allow.delete();
    console.log(`Removed ${email} from the faculty allowlist.`);
  } else {
    console.log(`${email} was not on the allowlist.`);
  }
  const users = await db.collection("users").where("email", "==", email).get();
  for (const d of users.docs) {
    await db.recursiveDelete(d.ref);
    await getAuth().setCustomUserClaims(d.id, null).catch(() => undefined);
    await getAuth().revokeRefreshTokens(d.id).catch(() => undefined);
    console.log(`Deleted profile ${d.id} and signed them out everywhere.`);
  }
  console.log("Done. They lose faculty access immediately.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
