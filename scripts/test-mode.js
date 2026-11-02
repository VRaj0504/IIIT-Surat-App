const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const [mode, emailArg, phoneArg] = process.argv.slice(2);
const usage = () => {
  console.log('Usage:\n  node scripts/test-mode.js on <approver-email> <your-phone>\n  node scripts/test-mode.js off\n  node scripts/test-mode.js status');
  process.exit(1);
};

const cfg = (id) => db.collection('config').doc(id);

async function userInfo(email) {
  const s = await db.collection('users').where('email', '==', email).limit(1).get();
  if (s.empty) return null;
  const u = s.docs[0].data();
  return { uid: s.docs[0].id, role: u.role, isAdmin: u.isAdmin === true, hasPhone: !!(u.expoPushToken || (u.expoPushTokens || []).length) };
}

async function status() {
  const [ml, sos, mlLive, sosLive] = await Promise.all(['medicalLeave', 'sos', 'medicalLeave_live', 'sos_live'].map((id) => cfg(id).get()));
  const m = ml.data() || {};
  const s = sos.data() || {};
  console.log(`Test mode: ${m.testMode ? 'ON' : 'off'}${mlLive.exists ? ' (live config backed up)' : ''}`);
  console.log(`  Office:          ${m.office?.email}`);
  console.log(`  Medical Officer: ${(m.medicalOfficer || m.doctor)?.email}`);
  console.log(`  HODs:            ${(m.hods || []).map((h) => `${h.department}=${h.email}`).join(', ')}`);
  console.log(`  Assoc. Dean:     ${m.dean?.email}`);
  console.log(`  Joint Registrar: ${m.jr?.email}`);
  console.log(`  SOS responders:  ${(s.responderEmails || []).join(', ') || '—'}`);
  console.log(`  SOS SMS numbers: ${(s.smsNumbers || []).join(', ') || '—'}${sosLive.exists ? ' (live config backed up)' : ''}`);
}

async function on(email, phone) {
  email = String(email || '').trim().toLowerCase();
  phone = String(phone || '').replace(/[^\d+]/g, '');
  if (!email.endsWith('@iiitsurat.ac.in')) throw new Error('Approver email must be an @iiitsurat.ac.in account.');
  if (phone.replace(/\D/g, '').length < 10) throw new Error('Give your own 10-digit phone number for SOS SMS.');

  const [ml, sos, mlLive, sosLive] = await Promise.all(['medicalLeave', 'sos', 'medicalLeave_live', 'sos_live'].map((id) => cfg(id).get()));
  if (ml.data()?.testMode) throw new Error('Test mode is already ON. Run "off" first.');
  if (!mlLive.exists) await cfg('medicalLeave_live').set(ml.data() || {});
  if (!sosLive.exists) await cfg('sos_live').set(sos.data() || {});

  const live = ml.data() || {};
  const p = (name, designation) => ({ name: `${name} (TEST)`, email, designation });
  const hods = (live.hods && live.hods.length ? live.hods : [{ department: 'CSE' }, { department: 'ECE' }, { department: 'MNC' }]).map((h) => ({
    department: h.department,
    name: `HOD ${h.department} (TEST)`,
    email,
  }));
  const hodByBranch = {};
  for (const h of hods) if (['CSE', 'ECE', 'MNC'].includes(h.department)) hodByBranch[h.department] = { name: h.name, email };

  const rest = { ...live };
  delete rest.doctor;
  await cfg('medicalLeave').set({
    ...rest,
    testMode: true,
    office: p('Academic Office', 'Academic Office'),
    medicalOfficer: p('Medical Officer', 'Medical Officer'),
    hods,
    hodEmails: [email],
    hodByBranch,
    dean: p('Associate Dean', 'Associate Dean'),
    jr: p('Joint Registrar', 'Joint Registrar'),
  });
  await cfg('sos').set({ ...(sos.data() || {}), testMode: true, responderEmails: [email], smsNumbers: [phone] });

  console.log('Test mode ON. Real office, medical officer, HODs, dean, JR and SOS responders will NOT be contacted.\n');
  await status();
  const u = await userInfo(email);
  console.log('');
  if (!u) console.log(`WARNING: ${email} has never signed in to CollegeGo. Sign in once on the portal and the phone app before testing.`);
  else {
    console.log(`${email}: role=${u.role}${u.isAdmin ? ' (admin)' : ''}, phone registered for notifications: ${u.hasPhone ? 'yes' : 'NO — open the app on your phone once'}`);
  }
}

async function off() {
  const [mlLive, sosLive] = await Promise.all([cfg('medicalLeave_live').get(), cfg('sos_live').get()]);
  if (!mlLive.exists && !sosLive.exists) {
    console.log('Nothing to restore — test mode was not on.');
    return status();
  }
  if (mlLive.exists) {
    await cfg('medicalLeave').set(mlLive.data());
    await cfg('medicalLeave_live').delete();
  }
  if (sosLive.exists) {
    await cfg('sos').set(sosLive.data());
    await cfg('sos_live').delete();
  }
  console.log('Test mode OFF. Live config restored.\n');
  await status();
}

(async () => {
  if (mode === 'on') await on(emailArg, phoneArg);
  else if (mode === 'off') await off();
  else if (mode === 'status') await status();
  else usage();
  process.exit(0);
})().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
