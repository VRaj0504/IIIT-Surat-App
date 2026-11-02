const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const serviceAccount = require('./serviceAccountKey.json');

const [testEmailArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const really = process.argv.includes('--yes');
if (!testEmailArg) {
  console.log('Usage: node scripts/clear-test-data.js <test-email> [--yes]');
  process.exit(1);
}
const testEmail = testEmailArg.trim().toLowerCase();

initializeApp({ credential: cert(serviceAccount), storageBucket: `${serviceAccount.project_id}.firebasestorage.app` });
const db = getFirestore();

async function bucketFor() {
  const names = [`${serviceAccount.project_id}.firebasestorage.app`, `${serviceAccount.project_id}.appspot.com`];
  for (const n of names) {
    const b = getStorage().bucket(n);
    const [ok] = await b.exists().catch(() => [false]);
    if (ok) return b;
  }
  return null;
}

(async () => {
  const live = (await db.collection('config').doc('medicalLeave').get()).data() || {};
  if (live.testMode) throw new Error('Test mode is still ON. Run "node scripts/test-mode.js off" first.');

  const me = await db.collection('users').where('email', '==', testEmail).limit(1).get();
  const uid = me.empty ? null : me.docs[0].id;

  const leaves = await db.collection('leaveApplications').where('officeEmail', '==', testEmail).get();
  const sos = uid ? await db.collection('sosAlerts').where('studentUid', '==', uid).get() : { docs: [] };

  console.log(`Test medical leaves (routed to ${testEmail}): ${leaves.size}`);
  leaves.docs.forEach((d) => {
    const x = d.data();
    console.log(`  ${x.refNo || d.id} · ${x.studentName} · ${x.stage}`);
  });
  console.log(`SOS alerts raised by ${testEmail}: ${sos.docs.length}`);
  sos.docs.forEach((d) => {
    const x = d.data();
    const t = x.createdAt?.toDate?.().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) || '';
    console.log(`  ${d.id} · ${x.type} · ${x.status} · ${t}`);
  });

  const counterRef = db.collection('counters').doc(`medical-${new Date().getFullYear()}`);
  const realLeft = (await db.collection('leaveApplications').where('flow', '==', 2).get()).docs.filter((d) => d.data().officeEmail !== testEmail).length;
  console.log(`Real medical leaves that stay: ${realLeft}${realLeft === 0 ? ' → reference numbers restart at 0001' : ''}`);

  if (!really) {
    console.log('\nNothing deleted. Check the list above, then run again with --yes');
    process.exit(0);
  }

  const bucket = await bucketFor();
  for (const d of leaves.docs) {
    const x = d.data();
    for (const sub of ['events', 'teacherAcks']) {
      const s = await d.ref.collection(sub).get();
      await Promise.all(s.docs.map((e) => e.ref.delete()));
    }
    await db.collection('medicalExcusals').doc(d.id).delete().catch(() => undefined);
    if (bucket && x.studentUid) await bucket.deleteFiles({ prefix: `medicalLeaves/${x.studentUid}/${d.id}/` }).catch(() => undefined);
    await d.ref.delete();
    console.log(`deleted ${x.refNo || d.id}`);
  }
  for (const d of sos.docs) {
    await d.ref.delete();
    console.log(`deleted SOS ${d.id}`);
  }
  if (realLeft === 0) {
    await counterRef.delete().catch(() => undefined);
    console.log('reset medical reference counter');
  }
  console.log('\nDone.');
  process.exit(0);
})().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
