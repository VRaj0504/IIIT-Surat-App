// Shows which screens were opened most in the last N days (default 7).
//   node scripts/usage-report.js        -> last 7 days
//   node scripts/usage-report.js 30     -> last 30 days
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldPath } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const days = Math.max(1, Math.min(365, parseInt(process.argv[2] || "7", 10) || 7));
  const from = new Date(Date.now() + 5.5 * 3600 * 1000 - (days - 1) * 86400000).toISOString().slice(0, 10);
  const snap = await db.collection("usageDaily").where(FieldPath.documentId(), ">=", from).get();
  if (snap.empty) {
    console.log(`No usage recorded since ${from}. It starts filling once the new app version is in use.`);
    return;
  }
  const totals = {};
  let opens = 0;
  console.log(`\nApp opens per day since ${from}`);
  snap.docs.forEach((d) => {
    const data = d.data();
    opens += data.opens || 0;
    console.log(`  ${d.id}  ${data.opens || 0}`);
    Object.entries(data.screens || {}).forEach(([name, n]) => (totals[name] = (totals[name] || 0) + n));
  });
  console.log(`\nTotal app opens: ${opens}\n\nScreen views, most used first`);
  Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, n]) => console.log(`  ${String(n).padStart(6)}  ${name}`));
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
