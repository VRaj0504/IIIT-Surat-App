const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
initializeApp({ credential: cert(require("./serviceAccountKey.json")) });
const db = getFirestore();

const usage = () => {
  console.log("Usage:\n  node scripts/set-leadership.js list\n  node scripts/set-leadership.js add director@iiitsurat.ac.in [more emails]\n  node scripts/set-leadership.js remove someone@iiitsurat.ac.in");
  process.exit(1);
};

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const ref = db.collection("config").doc("leadership");
  const emails = rest.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (mode === "add" || mode === "remove") {
    if (!emails.length || emails.some((e) => !e.endsWith("@iiitsurat.ac.in"))) usage();
    if (mode === "add") {
      for (const e of emails) {
        const u = await db.collection("users").where("email", "==", e).limit(1).get();
        console.log(u.empty ? `! ${e} has not signed in to CollegeGo yet. They can still be added; the page appears once they sign in to the portal.` : `✓ ${e} (${u.docs[0].data().name ?? "no name"})`);
      }
    }
    await ref.set({ emails: mode === "add" ? FieldValue.arrayUnion(...emails) : FieldValue.arrayRemove(...emails), updatedAt: new Date() }, { merge: true });
  } else if (mode !== "list") usage();
  const now = (await ref.get()).data()?.emails ?? [];
  console.log(`\nDirector's office (dashboard + call meetings): ${now.length ? "" : "nobody yet"}`);
  now.forEach((e) => console.log(`  ${e}`));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
