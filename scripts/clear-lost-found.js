const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const serviceAccount = require('./serviceAccountKey.json');

const really = process.argv.includes('--yes');
const beforeArg = process.argv.find((a) => a.startsWith('--before='));
const before = beforeArg ? new Date(`${beforeArg.slice(9)}T00:00:00+05:30`) : null;
if (beforeArg && Number.isNaN(before?.getTime())) {
  console.log('Use --before=YYYY-MM-DD');
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function bucketFor() {
  for (const n of [`${serviceAccount.project_id}.firebasestorage.app`, `${serviceAccount.project_id}.appspot.com`]) {
    const b = getStorage().bucket(n);
    const [ok] = await b.exists().catch(() => [false]);
    if (ok) return b;
  }
  return null;
}

const when = (d) => d?.createdAt?.toDate?.() ?? null;
const keep = (d) => before && (when(d) ?? new Date(0)) >= before;

async function deleteAll(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

(async () => {
  const [items, contacts, reports] = await Promise.all([
    db.collection('lostFoundItems').get(),
    db.collection('lostFoundContacts').get(),
    db.collection('reports').where('kind', '==', 'lostFound').get(),
  ]);
  const goItems = items.docs.filter((d) => !keep(d.data()));
  const goIds = new Set(goItems.map((d) => d.id));
  const goContacts = contacts.docs.filter((d) => !keep(d.data()) || goIds.has(d.data().itemId));
  const goReports = reports.docs.filter((d) => !keep(d.data()) || goIds.has(d.data().itemId));
  const paths = goItems.map((d) => d.data().storagePath).filter(Boolean);

  console.log(before ? `Removing lost & found posts from before ${beforeArg.slice(9)}` : 'Removing ALL lost & found posts');
  console.log(`  posts: ${goItems.length} of ${items.size}`);
  goItems.slice(0, 30).forEach((d) => {
    const x = d.data();
    const t = when(x)?.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) ?? '?';
    console.log(`    ${t} · ${x.type ?? ''} · ${x.title ?? d.id} · ${x.postedByName ?? ''}`);
  });
  if (goItems.length > 30) console.log(`    … and ${goItems.length - 30} more`);
  console.log(`  contact requests: ${goContacts.length}`);
  console.log(`  reports about posts: ${goReports.length}`);
  console.log(`  photos: ${paths.length}`);

  if (!really) {
    console.log('\nNothing deleted. Check the list, then run again with --yes');
    process.exit(0);
  }

  const bucket = await bucketFor();
  let photos = 0;
  if (bucket) {
    for (const p of paths) {
      await bucket.file(p).delete().then(() => photos++).catch(() => undefined);
    }
    if (!before) {
      const [files] = await bucket.getFiles({ prefix: 'lostFound/' }).catch(() => [[]]);
      for (const f of files) await f.delete().then(() => photos++).catch(() => undefined);
    }
  }
  await deleteAll(goContacts.map((d) => d.ref));
  await deleteAll(goReports.map((d) => d.ref));
  await deleteAll(goItems.map((d) => d.ref));
  console.log(`\nDeleted ${goItems.length} posts, ${goContacts.length} contact requests, ${goReports.length} reports, ${photos} photos.`);
  process.exit(0);
})().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
