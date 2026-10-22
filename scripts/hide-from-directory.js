const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const show = process.argv.includes("--show");
  if (!email.endsWith("@iiitsurat.ac.in")) {
    console.error("Usage: node scripts/hide-from-directory.js name@iiitsurat.ac.in [--show]");
    process.exit(1);
  }
  const value = !show;
  let touched = 0;

  const allowRef = db.collection("allowlist").doc(email);
  if ((await allowRef.get()).exists) {
    await allowRef.update({ hideFromDirectory: value });
    console.log(`allowlist/${email}: hideFromDirectory = ${value}`);
    touched++;
  } else {
    console.log(`allowlist/${email}: not found, skipped`);
  }

  const users = await db.collection("users").where("email", "==", email).get();
  for (const doc of users.docs) {
    await doc.ref.update({ hideFromDirectory: value });
    console.log(`users/${doc.id}: hideFromDirectory = ${value}`);
    touched++;
  }
  if (users.empty) console.log("users: no account with this email, skipped");

  console.log(touched ? "Done." : "Nothing was updated.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
