const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const serviceAccount = require('./serviceAccountKey.json');

const [cmd, arg] = process.argv.slice(2);
const usage = () => {
  console.log('node scripts/plus-access.js grant <email>');
  console.log('node scripts/plus-access.js revoke <email>');
  console.log('node scripts/plus-access.js all on|off');
  console.log('node scripts/plus-access.js list');
  process.exit(1);
};
if (!['grant', 'revoke', 'all', 'list'].includes(cmd)) usage();

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

(async () => {
  if (cmd === 'all') {
    if (!['on', 'off'].includes(arg)) usage();
    await db.collection('plusConfig').doc('main').set({ enabled: arg === 'on' }, { merge: true });
    console.log(`Plus for everyone: ${arg}`);
  } else if (cmd === 'list') {
    const cfg = await db.collection('plusConfig').doc('main').get();
    console.log(`Plus for everyone: ${cfg.get('enabled') === true ? 'on' : 'off'}`);
    const snap = await db.collection('plusAccess').get();
    snap.docs.forEach((d) => console.log(`  ${d.get('email') ?? ''} (${d.id})`));
    if (snap.empty) console.log('  no testers');
  } else {
    if (!arg) usage();
    const email = arg.trim().toLowerCase();
    const user = await getAuth().getUserByEmail(email);
    const ref = db.collection('plusAccess').doc(user.uid);
    if (cmd === 'grant') {
      await ref.set({ email, grantedAt: new Date() });
      console.log(`Plus testing enabled for ${email}`);
    } else {
      await ref.delete();
      console.log(`Plus testing removed for ${email}`);
    }
  }
  process.exit(0);
})().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
