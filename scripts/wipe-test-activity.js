const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const serviceAccount = require('./serviceAccountKey.json');

const really = process.argv.includes('--yes');

const WIPE = {
  'Student requests': [
    'eventExcusals',
    'leaveApplications',
    'medicalExcusals',
    'complaints',
    'counsellingRequests',
    'lostFoundItems',
    'lostFoundContacts',
    'sosAlerts',
    'supportRequests',
    'reports',
  ],
  Posts: ['notices', 'announcements', 'meetings', 'clubEvents'],
};

const NEVER = new Set([
  'resources',
  'users',
  'roster',
  'allowlist',
  'enrollmentClaims',
  'counsellors',
  'eventCoordinators',
  'tnpCoordinators',
  'timetable',
  'curriculum',
  'holidayOverrides',
  'roomAliases',
  'messSubscriptions',
  'messAlwaysAvailable',
  'clubs',
  'config',
  'plusConfig',
  'plusAccess',
  'subscriptions',
]);

// Old photo folders to empty too (Lost & Found was removed from the app).
const WIPE_FILES = ['lostFound/', 'complaints/'];

initializeApp({ credential: cert(serviceAccount) });

async function bucket() {
  const names = [`${serviceAccount.project_id}.firebasestorage.app`, `${serviceAccount.project_id}.appspot.com`];
  for (const n of names) {
    const b = getStorage().bucket(n);
    const [ok] = await b.exists().catch(() => [false]);
    if (ok) return b;
  }
  return null;
}
const db = getFirestore();

async function countOf(name) {
  const snap = await db.collection(name).count().get();
  return snap.data().count;
}

(async () => {
  console.log(`Project: ${serviceAccount.project_id}\n`);
  const targets = [];
  for (const [group, names] of Object.entries(WIPE)) {
    console.log(group);
    for (const name of names) {
      if (NEVER.has(name)) throw new Error(`Refusing to touch protected collection ${name}`);
      const n = await countOf(name);
      console.log(`  ${name.padEnd(22)} ${n}`);
      targets.push(name);
    }
  }
  const b = await bucket();
  const fileCounts = {};
  if (b) {
    console.log('Photos');
    for (const prefix of WIPE_FILES) {
      const [files] = await b.getFiles({ prefix });
      fileCounts[prefix] = files.length;
      console.log(`  ${prefix.padEnd(22)} ${files.length}`);
    }
  }
  const resources = await countOf('resources');
  console.log(`\nKept: resources (${resources}), accounts, student list, timetable, curriculum, Thali lists, clubs.`);

  if (!really) {
    console.log('\nNothing deleted. Check the counts above, then run again with --yes');
    process.exit(0);
  }

  for (const name of targets) {
    await db.recursiveDelete(db.collection(name));
    console.log(`cleared ${name}`);
  }
  if (b) {
    for (const prefix of WIPE_FILES) {
      if (fileCounts[prefix]) await b.deleteFiles({ prefix });
      console.log(`cleared ${prefix}`);
    }
  }
  const year = new Date().getFullYear();
  for (const id of [`medical-${year}`, `medical-${year - 1}`]) {
    await db.collection('counters').doc(id).delete().catch(() => undefined);
  }
  console.log(`\nDone. Resources still: ${await countOf('resources')}`);
  process.exit(0);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
