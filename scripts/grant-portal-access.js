const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const key = (process.argv[2] || "").trim();
  if (!key) {
    console.error("Usage: node scripts/grant-portal-access.js <uid-or-email>");
    process.exit(1);
  }

  let snap;
  if (key.includes("@")) {
    const q = await db.collection("users").where("email", "==", key.toLowerCase()).limit(1).get();
    snap = q.empty ? null : q.docs[0];
  } else {
    const d = await db.collection("users").doc(key).get();
    snap = d.exists ? d : null;
  }
  if (!snap) {
    console.error("No user found. Sign in once with that account, then run this again.");
    process.exit(1);
  }

  const u = snap.data();
  const email = String(u.email || "").toLowerCase();
  console.log(`Found: ${u.name || "(no name)"} <${email}> uid ${snap.id}`);
  console.log(`Current: role=${u.role}, isAdmin=${u.isAdmin === true}`);

  if (u.role === "student") {
    console.error("\nThis is a STUDENT account. Not changed, because making it faculty would break the student app.");
    console.error("Sign in to the portal with a separate faculty account and run this for that one.");
    process.exit(1);
  }

  await db.collection("allowlist").doc(email).set({ role: "faculty" }, { merge: true });
  await snap.ref.update({ isAdmin: true });
  const after = (await snap.ref.get()).data();
  console.log(`Now: role=${after.role}, isAdmin=${after.isAdmin === true}`);
  console.log("Done. Sign out of the portal and sign in again.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
