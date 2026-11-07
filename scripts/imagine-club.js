// Creates the "Imagine" club and moves Exposure, Cineworks and Design under it.
// Dry run by default. Add --yes to make the change.
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

const really = process.argv.includes('--yes');
const PARENT = 'Imagine';
const MOVE = [
  { match: /exposure/i, description: 'Photography club under Imagine.' },
  { match: /cineworks/i, description: 'Videography club under Imagine.' },
  { match: /^\s*design\s*$/i, description: 'Design club under Imagine.', category: 'Cultural', lead: { name: 'Divya', email: 'ui24ec45@iiitsurat.ac.in' } },
];

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

(async () => {
  const all = await db.collection('clubs').get();
  const byId = new Map(all.docs.map((d) => [d.id, d.data()]));
  let parent = all.docs.find((d) => String(d.data().name).trim().toLowerCase() === PARENT.toLowerCase());

  const moves = [];
  for (const m of MOVE) {
    const hits = all.docs.filter((d) => m.match.test(String(d.data().name)));
    if (hits.length !== 1) throw new Error(`Expected 1 club for ${m.match}, found ${hits.length}: ${hits.map((h) => h.data().name).join(', ') || 'none'}`);
    const from = byId.get(hits[0].data().parentClubId)?.name ?? '(top level)';
    moves.push({ doc: hits[0], from, description: m.description, category: m.category, lead: m.lead });
  }

  console.log(parent ? `"${PARENT}" already exists (${parent.id}).` : `Will create "${PARENT}" (Cultural, no lead yet).`);
  moves.forEach((m) => console.log(`Move  ${m.doc.data().name.padEnd(32)} ${m.from}  ->  ${PARENT}${m.lead ? `   (lead: ${m.doc.data().leadName || 'none'} -> ${m.lead.name})` : ''}`));

  if (!really) {
    console.log('\nNothing changed. Run again with --yes');
    process.exit(0);
  }

  if (!parent) {
    const ref = await db.collection('clubs').add({
      name: PARENT,
      category: 'Cultural',
      description: 'Creative club: photography, videography and design.',
      leadUid: null,
      leadName: '',
      leadEmail: null,
      parentClubId: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    parent = await ref.get();
    console.log(`created ${PARENT}`);
  }
  for (const m of moves) {
    let lead = {};
    if (m.lead) {
      const u = await db.collection('users').where('email', '==', m.lead.email).limit(1).get();
      lead = { leadName: m.lead.name, leadEmail: m.lead.email, leadUid: u.empty ? null : u.docs[0].id };
    }
    await m.doc.ref.update({ parentClubId: parent.id, description: m.description, ...(m.category ? { category: m.category } : {}), ...lead });
    console.log(`moved   ${m.doc.data().name}`);
  }
  console.log('\nDone. To set a lead: open Imagine in the app with a faculty account -> Manage club lead.');
  process.exit(0);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
