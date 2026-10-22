

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const remove = process.argv.includes("--remove");
  if (!email.endsWith("@iiitsurat.ac.in")) {
    console.error("Usage: node scripts/make-admin.js name@iiitsurat.ac.in [--remove]");
    process.exit(1);
  }
  const snap = await db.collection("users").where("email", "==", email).limit(1).get();
  if (snap.empty) {
    console.error(`${email} hasn't signed in to the app yet — sign in once, then run this again.`);
    process.exit(1);
  }
  const ref = snap.docs[0].ref;
  await ref.update({ isAdmin: !remove });
  const d = (await ref.get()).data();
  console.log(`${d.name} (${email}) — role: ${d.role}, admin: ${d.isAdmin === true ? "YES" : "no"}`);
  console.log(remove ? "Admin access removed." : "Done. Sign out and back in to the portal to see admin tools.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
