const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const FIELDS = ['branch', 'section', 'admissionYear', 'specialization', 'program'];
const dry = process.argv.includes('--dry');

(async () => {
  const [roster, users] = await Promise.all([db.collection('roster').get(), db.collection('users').where('role', '==', 'student').get()]);
  const byReg = new Map(roster.docs.map((d) => [d.id.toUpperCase(), d.data()]));
  let changed = 0;
  let missing = 0;
  let noToken = 0;
  let batch = db.batch();
  let n = 0;
  for (const d of users.docs) {
    const u = d.data();
    if (!u.expoPushToken && !(u.expoPushTokens || []).length) noToken++;
    const r = byReg.get(String(u.enrollmentNumber || '').toUpperCase());
    if (!r) {
      missing++;
      continue;
    }
    const patch = {};
    for (const f of FIELDS) {
      const want = r[f] === undefined || r[f] === '' ? null : r[f];
      const have = u[f] === undefined ? null : u[f];
      if (want !== have) patch[f] = want === null ? FieldValue.delete() : want;
    }
    if (!Object.keys(patch).length) continue;
    changed++;
    console.log(`${u.enrollmentNumber}: ${Object.keys(patch).map((k) => `${k} ${JSON.stringify(u[k] ?? null)} → ${JSON.stringify(r[k] ?? null)}`).join(', ')}`);
    if (!dry) {
      batch.update(d.ref, patch);
      if (++n === 400) {
        await batch.commit();
        batch = db.batch();
        n = 0;
      }
    }
  }
  if (!dry && n) await batch.commit();
  console.log(`\n${users.size} student accounts · ${changed} ${dry ? 'would be' : ''} updated · ${missing} not on roster · ${noToken} have no phone registered for notifications`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
