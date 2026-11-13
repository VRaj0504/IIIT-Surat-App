// TEMPLATE — copy this file to start a new script:
//   cp scripts/_template.js scripts/my-task.js
//
// What it does: <one line>
// Usage:
//   node scripts/my-task.js <email>            -> preview (changes nothing)
//   node scripts/my-task.js <email> --apply    -> makes the change
//
// Rules that keep live data safe:
//   1. Read and print what WOULD change first.
//   2. Only write inside `if (APPLY)`.
//   3. Write in batches of up to 400.

const { db, FieldValue, arg, APPLY, userByEmail, run } = require("./lib/admin");

run(async () => {
  const email = arg(0);
  if (!email) {
    console.log("Usage: node scripts/my-task.js <email> [--apply]");
    process.exit(1);
  }

  const user = await userByEmail(email);
  if (!user) throw new Error(`No account for ${email}`);

  // 1. Find what to change
  const snap = await db.collection("users").where("__name__", "==", user.uid).get();
  console.log(`Found ${snap.size} document(s):`);
  snap.docs.forEach((d) => console.log("  ", d.id, d.data().name || ""));

  // 2. Change it only with --apply
  if (APPLY) {
    let batch = db.batch();
    let n = 0;
    for (const d of snap.docs) {
      batch.update(d.ref, { updatedAt: FieldValue.serverTimestamp() });
      if (++n % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    await batch.commit();
    console.log(`Updated ${n} document(s).`);
  }
});
