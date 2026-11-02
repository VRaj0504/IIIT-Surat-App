const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const name = (process.argv[3] || "").trim();
  const department = (process.argv[4] || "").trim();
  if (!email.endsWith("@iiitsurat.ac.in")) {
    console.error('Usage: node scripts/add-faculty.js name@iiitsurat.ac.in "Full Name" "Department"');
    process.exit(1);
  }
  const ref = db.collection("allowlist").doc(email);
  const had = (await ref.get()).exists;
  await ref.set(
    { role: "faculty", ...(name ? { name } : {}), ...(department ? { department } : {}) },
    { merge: true },
  );
  console.log(`${had ? "Updated" : "Added"} ${email} as faculty.`);
  console.log("They can now sign in at https://collegego-faculty.web.app with this email.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
