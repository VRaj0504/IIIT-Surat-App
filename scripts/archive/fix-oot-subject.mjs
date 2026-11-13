

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCF5YItLRNrDtNnO6MgHeLweyzeKwT7ov8',
  authDomain: 'iiit-surat-app-6643d.firebaseapp.com',
  projectId: 'iiit-surat-app-6643d',
  storageBucket: 'iiit-surat-app-6643d.firebasestorage.app',
  messagingSenderId: '568691830636',
  appId: '1:568691830636:web:4be7fd34f4098d1d994d49',
};

const CONFIRMED = process.argv.includes('--confirm');

const OLD_BRANCH = 'CSE';
const OLD_SEMESTER = 4;
const OLD_SUBJECT = 'Object Oriented Technology';

const NEW_SUBJECT = 'Object Oriented Programming';
const NEW_SEMESTER = 3;

async function main() {
  const email = process.env.FACULTY_EMAIL;
  const password = process.env.FACULTY_PASSWORD;
  if (!email || !password) {
    console.error('Set FACULTY_EMAIL and FACULTY_PASSWORD environment variables before running.');
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log(`Signing in as ${email}...`);
  await signInWithEmailAndPassword(auth, email, password);
  console.log('Signed in.\n');

  const snap = await getDocs(
    query(
      collection(db, 'resources'),
      where('branch', '==', OLD_BRANCH),
      where('semester', '==', OLD_SEMESTER),
      where('subject', '==', OLD_SUBJECT),
      where('type', '==', 'PYQ'),
    ),
  );

  console.log(`Found ${snap.size} matching resource doc(s):`);
  snap.docs.forEach((d) => {
    const r = d.data();
    console.log(`  - "${r.title}" (${r.examYear}) — id ${d.id}`);
  });

  if (snap.size === 0) {
    console.log('\nNothing to fix — either already fixed, or nothing matched these old values.');
    return;
  }

  if (!CONFIRMED) {
    console.log(`\nWould change all ${snap.size} to: subject="${NEW_SUBJECT}", semester=${NEW_SEMESTER}`);
    console.log('Dry run complete. Re-run with --confirm to actually apply this.');
    return;
  }

  console.log('\nFixing...\n');
  for (const d of snap.docs) {
    const old = d.data();

    await addDoc(collection(db, 'resources'), {
      title: old.title,
      subject: NEW_SUBJECT,
      branch: old.branch,
      semester: NEW_SEMESTER,
      section: old.section ?? null,
      type: old.type,
      examYear: old.examYear,
      fileUrl: old.fileUrl,
      storagePath: old.storagePath,
      uploadedBy: old.uploadedBy,
      uploadedByName: old.uploadedByName,
      createdAt: serverTimestamp(),
    });
    await deleteDoc(doc(db, 'resources', d.id));
    console.log(`fixed  "${old.title}" (${old.examYear})`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
