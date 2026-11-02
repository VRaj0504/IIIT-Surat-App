const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const undo = process.argv.includes("--undo");
  if (!email.endsWith("@iiitsurat.ac.in")) {
    console.error("Usage: node scripts/set-non-teaching.js name@iiitsurat.ac.in [--undo]");
    process.exit(1);
  }
  const ref = db.collection("allowlist").doc(email);
  if (!(await ref.get()).exists) {
    console.error(`${email} is not on the allowlist.`);
    process.exit(1);
  }
  await ref.update({ nonTeaching: !undo });
  console.log(
    undo
      ? `${email} is teaching staff again: can enter grades, attendance and timetables.`
      : `${email} is non-teaching: can't enter or read grades, attendance, timetables or the roster editor.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
