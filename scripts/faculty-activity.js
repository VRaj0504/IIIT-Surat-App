const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const serviceAccount = require('./serviceAccountKey.json');

const wantCsv = process.argv.includes('--csv');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const auth = getAuth();

const fmt = (d) =>
  d ? d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '-';
const ago = (d) => {
  if (!d) return 'never';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};
const toDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);

(async () => {
  const [allow, sessions, uploads] = await Promise.all([
    db.collection('allowlist').where('role', '==', 'faculty').get(),
    db.collection('attendanceSessions').select('markedBy', 'markedAt').get(),
    db.collection('marksUploads').select('uploadedBy', 'createdAt').get(),
  ]);

  const tally = (snap, uidField, atField) => {
    const m = new Map();
    snap.docs.forEach((d) => {
      const uid = d.get(uidField);
      if (!uid) return;
      const at = toDate(d.get(atField));
      const cur = m.get(uid) ?? { n: 0, last: null };
      cur.n++;
      if (at && (!cur.last || at > cur.last)) cur.last = at;
      m.set(uid, cur);
    });
    return m;
  };
  const att = tally(sessions, 'markedBy', 'markedAt');
  const mk = tally(uploads, 'uploadedBy', 'createdAt');

  const faculty = allow.docs.map((d) => ({ email: d.id.toLowerCase(), name: d.get('name') ?? '' }));
  const accounts = new Map();
  for (let i = 0; i < faculty.length; i += 100) {
    const res = await auth.getUsers(faculty.slice(i, i + 100).map((f) => ({ email: f.email })));
    res.users.forEach((u) => accounts.set(u.email.toLowerCase(), u));
  }

  const rows = faculty.map((f) => {
    const u = accounts.get(f.email);
    const lastSignIn = u?.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime) : null;
    const lastActive = u?.metadata.lastRefreshTime ? new Date(u.metadata.lastRefreshTime) : lastSignIn;
    const a = u ? att.get(u.uid) : null;
    const m = u ? mk.get(u.uid) : null;
    return {
      name: f.name || (u?.displayName ?? ''),
      email: f.email,
      account: u ? 'yes' : 'not signed up',
      lastSignIn,
      lastActive,
      attendance: a?.n ?? 0,
      attendanceLast: a?.last ?? null,
      marks: m?.n ?? 0,
      marksLast: m?.last ?? null,
    };
  });
  rows.sort((x, y) => (y.lastActive?.getTime() ?? 0) - (x.lastActive?.getTime() ?? 0));

  const signedUp = rows.filter((r) => r.account === 'yes');
  const week = signedUp.filter((r) => r.lastActive && Date.now() - r.lastActive.getTime() < 7 * 86400000);
  console.log(`Faculty on the list: ${rows.length}`);
  console.log(`Signed up: ${signedUp.length}   Active in the last 7 days: ${week.length}   Not signed up yet: ${rows.length - signedUp.length}\n`);

  for (const r of rows) {
    console.log(`${r.name || r.email}`);
    console.log(`   ${r.email}`);
    if (r.account !== 'yes') {
      console.log('   not signed up yet\n');
      continue;
    }
    console.log(`   last active: ${ago(r.lastActive)} (${fmt(r.lastActive)})   last sign-in: ${fmt(r.lastSignIn)}`);
    console.log(`   attendance classes saved: ${r.attendance}${r.attendanceLast ? ` (last ${fmt(r.attendanceLast)})` : ''}   marks uploads: ${r.marks}${r.marksLast ? ` (last ${fmt(r.marksLast)})` : ''}\n`);
  }

  if (wantCsv) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['Name', 'Email', 'Account', 'Last active', 'Last sign-in', 'Attendance classes saved', 'Last attendance', 'Marks uploads', 'Last marks upload'].map(esc).join(','),
      ...rows.map((r) =>
        [r.name, r.email, r.account, fmt(r.lastActive), fmt(r.lastSignIn), r.attendance, fmt(r.attendanceLast), r.marks, fmt(r.marksLast)].map(esc).join(','),
      ),
    ];
    fs.writeFileSync('faculty-activity.csv', lines.join('\n'));
    console.log('Saved faculty-activity.csv');
  }
  process.exit(0);
})().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
