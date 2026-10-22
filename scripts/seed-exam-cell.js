const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const args = process.argv.slice(2);
  const remove = args.includes("--remove");
  const emails = args.filter((a) => !a.startsWith("--")).map((e) => e.trim().toLowerCase());
  const ref = db.collection("config").doc("exams");

  if (emails.length === 0) {
    const snap = await ref.get();
    const list = snap.exists ? snap.data().examCellEmails || [] : [];
    console.log("Usage: node scripts/seed-exam-cell.js name@iiitsurat.ac.in [more emails] [--remove]");
    console.log(list.length ? `Current exam cell: ${list.join(", ")}` : "No exam cell members yet.");
    return;
  }

  for (const email of emails) {
    if (!email.endsWith("@iiitsurat.ac.in")) {
      console.error(`Not an institute email: ${email}`);
      process.exit(1);
    }
  }

  await ref.set(
    { examCellEmails: remove ? FieldValue.arrayRemove(...emails) : FieldValue.arrayUnion(...emails) },
    { merge: true },
  );
  const after = (await ref.get()).data().examCellEmails || [];
  console.log(remove ? "Removed." : "Added.");
  console.log(`Exam cell now: ${after.join(", ") || "(empty)"}`);

  for (const email of emails) {
    if (remove) continue;
    const users = await db.collection("users").where("email", "==", email).limit(1).get();
    if (users.empty) console.warn(`Note: ${email} hasn't signed in yet. They need a faculty or admin account to open the portal.`);
    else {
      const u = users.docs[0].data();
      if (u.role !== "faculty" && u.isAdmin !== true) console.warn(`Note: ${email} is a ${u.role} account. The portal only opens for faculty or admin accounts.`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
