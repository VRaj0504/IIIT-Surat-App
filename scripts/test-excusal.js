// End-to-end test of the event excusal flow against the LIVE project, using two real accounts.
//
//   node --env-file=.env scripts/test-excusal.js <student-email> <faculty-email>
//
// What it does (and undoes):
//   - creates a temporary club "ZZ Excusal Test" led by <student-email>
//   - temporarily makes <faculty-email> the FIC, Dean of Student Welfare and Dean of Academics
//   - signs in as both accounts and runs the happy path plus the security checks
//   - deletes every test request and the test club, and puts the real signer settings back
// Both accounts may get a few push notifications while it runs.

const { initializeApp: adminInit, cert } = require('firebase-admin/app');
const { getFirestore: adminDb } = require('firebase-admin/firestore');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithCustomToken, signOut } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');
const { getFirestore, doc, updateDoc, setDoc, getDoc } = require('firebase/firestore');
const serviceAccount = require('./serviceAccountKey.json');

const [studentEmail, facultyEmail] = process.argv.slice(2).map((s) => String(s ?? '').trim().toLowerCase());
if (!studentEmail || !facultyEmail) {
  console.log('Usage: node --env-file=.env scripts/test-excusal.js <student-email> <faculty-email>');
  process.exit(1);
}
const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
if (!apiKey) {
  console.log('EXPO_PUBLIC_FIREBASE_API_KEY not found. Run it with: node --env-file=.env scripts/test-excusal.js ...');
  process.exit(1);
}

adminInit({ credential: cert(serviceAccount) });
const db = adminDb();
const TEST_CLUB = 'zz-excusal-test';
const created = [];
let passed = 0;
let failed = 0;

const ok = (name) => {
  passed++;
  console.log(`  ✔ ${name}`);
};
const bad = (name, why) => {
  failed++;
  console.log(`  ✘ ${name}\n      ${why}`);
};
async function expectDenied(name, fn, codes = ['permission-denied', 'functions/permission-denied']) {
  try {
    await fn();
    bad(name, 'it was allowed, but should have been refused');
  } catch (e) {
    const code = e?.code ?? '';
    if (codes.some((c) => code.endsWith(c.replace('functions/', '')))) ok(name);
    else bad(name, `refused with an unexpected error: ${code} ${e?.message}`);
  }
}
async function expectError(name, fn, code) {
  try {
    await fn();
    bad(name, 'it succeeded, but should have failed');
  } catch (e) {
    if (String(e?.code ?? '').endsWith(code)) ok(name);
    else bad(name, `expected ${code}, got ${e?.code} ${e?.message}`);
  }
}

function clientFor(label) {
  const app = initializeApp(
    {
      apiKey,
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || serviceAccount.project_id,
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    },
    label,
  );
  const fns = getFunctions(app, 'asia-south1');
  return {
    auth: getAuth(app),
    fs: getFirestore(app),
    call: (name, data) => httpsCallable(fns, name)(data).then((r) => r.data),
  };
}

async function userByEmail(email) {
  const snap = await db.collection('users').where('email', '==', email).limit(1).get();
  if (snap.empty) throw new Error(`${email} has no CollegeGo account. Sign in to the app once with it first.`);
  return { uid: snap.docs[0].id, ...snap.docs[0].data() };
}

const sigFake = { w: 300, h: 100, paths: ['M10 50 L60 20 L110 70 L160 30 L220 60'] };
const iso = (d) => d.toISOString().slice(0, 10);

(async () => {
  const student = await userByEmail(studentEmail);
  const faculty = await userByEmail(facultyEmail);
  if (student.role !== 'student') throw new Error(`${studentEmail} is not a student account.`);
  if (faculty.role !== 'faculty') throw new Error(`${facultyEmail} is not a faculty account.`);
  if (!student.enrollmentNumber) throw new Error(`${studentEmail} has no enrollment number.`);
  console.log(`Project: ${serviceAccount.project_id}\nStudent: ${student.name} (${student.enrollmentNumber})\nSigner:  ${faculty.name}\n`);

  // ---- set up --------------------------------------------------------------
  const cfgRef = db.collection('config').doc('eventExcusal');
  const cfgBefore = await cfgRef.get();
  const facultyPerson = { name: faculty.name, email: facultyEmail };
  await db.collection('clubs').doc(TEST_CLUB).set({
    name: 'ZZ Excusal Test',
    category: 'Other',
    description: 'Temporary club for scripts/test-excusal.js. Safe to delete.',
    leadUid: student.uid,
    leadName: student.name,
    leadEmail: studentEmail,
    parentClubId: null,
    createdAt: new Date(),
  });
  await cfgRef.set(
    { ...(cfgBefore.data() ?? {}), dsw: facultyPerson, dean: facultyPerson, fic: { ...((cfgBefore.data() ?? {}).fic ?? {}), [TEST_CLUB]: [facultyPerson] } },
  );

  const S = clientFor('student');
  const F = clientFor('faculty');
  await signInWithCustomToken(S.auth, await adminAuth().createCustomToken(student.uid));
  await signInWithCustomToken(F.auth, await adminAuth().createCustomToken(faculty.uid));

  const today = new Date();
  const later = new Date(today.getTime() + 3 * 86400000);
  const base = {
    clubId: TEST_CLUB,
    eventName: 'Script test event',
    category: 'Other',
    fromDate: iso(later),
    toDate: iso(later),
    fullDay: true,
    students: [student.enrollmentNumber],
  };

  try {
    console.log('Sending');
    const r1 = await S.call('excusalSubmit', base);
    created.push(r1.id);
    const d1 = (await db.collection('eventExcusals').doc(r1.id).get()).data();
    d1?.stage === 'fic' && d1?.status === 'pending' ? ok('club lead can send; it waits for the FIC') : bad('send', `stage=${d1?.stage}`);
    d1?.students?.[0]?.name ? ok('student names are filled in from the student list') : bad('student names', 'missing');

    await expectError('unknown enrollment number is refused', () => S.call('excusalSubmit', { ...base, students: ['UG99XXX999'] }), 'invalid-argument');
    await expectError('end date before start date is refused', () => S.call('excusalSubmit', { ...base, toDate: iso(today), fromDate: iso(later) }), 'invalid-argument');
    await expectError('end time before start time is refused', () => S.call('excusalSubmit', { ...base, fullDay: false, fromTime: '15:00', toTime: '14:00' }), 'invalid-argument');
    await expectDenied('faculty who is not a lead of this club cannot send for it', () => F.call('excusalSubmit', base));

    console.log('\nSecurity');
    await expectDenied('the club lead cannot sign their own request', () => S.call('excusalAct', { excusalId: r1.id, action: 'sign', signature: sigFake }));
    await expectDenied('the club lead cannot approve by writing to the database', () => updateDoc(doc(S.fs, 'eventExcusals', r1.id), { status: 'approved' }), ['permission-denied']);
    await expectDenied('nobody can create a request directly in the database', () =>
      setDoc(doc(S.fs, 'eventExcusals', 'zz-direct-write'), { ...base, flow: 2, status: 'approved', submittedBy: student.uid, studentEnrollmentNumbers: [student.enrollmentNumber] }), ['permission-denied']);
    await expectDenied('faculty cannot approve by writing to the database', () => updateDoc(doc(F.fs, 'eventExcusals', r1.id), { status: 'approved', stage: 'approved' }), ['permission-denied']);
    await expectError('signing without a signature is refused', () => F.call('excusalAct', { excusalId: r1.id, action: 'sign' }), 'invalid-argument');
    await expectError('rejecting without a reason is refused', () => F.call('excusalAct', { excusalId: r1.id, action: 'reject' }), 'invalid-argument');
    const canRead = await getDoc(doc(F.fs, 'eventExcusals', r1.id)).then((x) => x.exists()).catch(() => false);
    canRead ? ok('the signer can read the request') : bad('signer read', 'faculty could not read it');

    console.log('\nSignatures');
    for (const step of ['fic', 'dsw', 'dean']) {
      await F.call('excusalAct', { excusalId: r1.id, action: 'sign', signature: sigFake, saveSignature: false, remark: `test ${step}` });
      const now = (await db.collection('eventExcusals').doc(r1.id).get()).data();
      const want = step === 'fic' ? 'dsw' : step === 'dsw' ? 'dean' : 'approved';
      now?.stage === want && now?.signatures?.[step] ? ok(`${step.toUpperCase()} signed, now at ${want}`) : bad(`${step} sign`, `stage=${now?.stage}`);
    }
    const fin = (await db.collection('eventExcusals').doc(r1.id).get()).data();
    fin?.status === 'approved' ? ok('approved after all three signatures') : bad('approved', `status=${fin?.status}`);
    await expectError('a closed request cannot be signed again', () => F.call('excusalAct', { excusalId: r1.id, action: 'sign', signature: sigFake }), 'failed-precondition');
    const seen = await getDoc(doc(S.fs, 'eventExcusals', r1.id)).then((x) => x.exists()).catch(() => false);
    seen ? ok('the student on the list can read the approval (used for attendance)') : bad('student read', 'could not read');

    console.log('\nReject, edit and resend, withdraw');
    const r2 = await S.call('excusalSubmit', { ...base, fullDay: false, fromTime: '09:00', toTime: '11:00' });
    created.push(r2.id);
    typeof r2.timedClasses === 'number' ? ok(`timed request works out the classes inside the window (${r2.timedClasses} found)`) : bad('timed', 'no count');
    await F.call('excusalAct', { excusalId: r2.id, action: 'reject', remark: 'Test rejection' });
    const rej = (await db.collection('eventExcusals').doc(r2.id).get()).data();
    rej?.status === 'rejected' && rej?.rejectedReason === 'Test rejection' ? ok('signer can reject with a reason') : bad('reject', `status=${rej?.status}`);
    await S.call('excusalSubmit', { ...base, excusalId: r2.id, eventName: 'Script test event (fixed)' });
    const re = (await db.collection('eventExcusals').doc(r2.id).get()).data();
    re?.stage === 'fic' && (re?.history ?? []).length >= 3 ? ok('lead can edit and send it again; history is kept') : bad('resend', `stage=${re?.stage}`);
    await S.call('excusalWithdraw', { excusalId: r2.id });
    const wd = (await db.collection('eventExcusals').doc(r2.id).get()).data();
    wd?.status === 'withdrawn' ? ok('lead can withdraw while it is pending') : bad('withdraw', `status=${wd?.status}`);
    await expectError('a withdrawn request cannot be signed', () => F.call('excusalAct', { excusalId: r2.id, action: 'sign', signature: sigFake }), 'failed-precondition');
    await expectDenied('only the person who sent it can withdraw', () => F.call('excusalWithdraw', { excusalId: r1.id }));
  } finally {
    console.log('\nCleaning up');
    for (const id of created) await db.collection('eventExcusals').doc(id).delete().catch(() => undefined);
    await db.collection('eventExcusals').doc('zz-direct-write').delete().catch(() => undefined);
    await db.collection('clubs').doc(TEST_CLUB).delete().catch(() => undefined);
    if (cfgBefore.exists) await cfgRef.set(cfgBefore.data());
    else await cfgRef.delete();
    await signOut(S.auth).catch(() => undefined);
    await signOut(F.auth).catch(() => undefined);
    console.log('  test requests, test club removed; signer settings restored');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('\nStopped:', e.message || e);
  process.exit(1);
});
