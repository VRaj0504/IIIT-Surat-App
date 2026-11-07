const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

const [emailArg, mode] = process.argv.slice(2);
if (emailArg !== 'list' && (!emailArg || !['on', 'off'].includes(mode))) {
  console.log('Usage: node scripts/preview-tester.js <email> on|off\n       node scripts/preview-tester.js list');
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

(async () => {
  if (emailArg === 'list') {
    const snap = await db.collection('users').where('previewTester', '==', true).get();
    if (snap.empty) console.log('Nobody has the "Preview as faculty" switch yet.');
    snap.docs.forEach((d) => console.log(`${d.data().email}  ${d.data().name ?? ''}`));
    process.exit(0);
  }
  const email = emailArg.trim().toLowerCase();
  const snap = await db.collection('users').where('email', '==', email).limit(1).get();
  if (snap.empty) throw new Error(`No account with ${email}. They need to sign in to the app once first.`);
  const ref = snap.docs[0].ref;
  await ref.update({ previewTester: mode === 'on' });
  console.log(`${email}: "Preview as faculty" ${mode === 'on' ? 'on' : 'off'} in Profile (admins always have it).`);
  process.exit(0);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
