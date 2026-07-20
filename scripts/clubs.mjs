// One-time script to bulk-create clubs in Firestore.
// Uses the same client SDK + security rules as the app itself — no admin
// key needed. You just need to sign in as a faculty account.
//
// Usage:
//   FACULTY_EMAIL="you@iiitsurat.ac.in" FACULTY_PASSWORD="yourpassword" node scripts/bulk-create-clubs.mjs
//
// Safe to re-run: it skips any club whose name already exists in Firestore,
// so if it fails partway through you can just run it again.

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

// Same public client config as src/firebase/config.ts
const firebaseConfig = {
  apiKey: 'AIzaSyBXlf0tidwgnJemq_xHL0Pus14LokQK2cw',
  authDomain: 'iiit-surat-app-6643d.firebaseapp.com',
  projectId: 'iiit-surat-app-6643d',
  storageBucket: 'iiit-surat-app-6643d.firebasestorage.app',
  messagingSenderId: '568691830636',
  appId: '1:568691830636:web:4be7fd34f4098d1d994d49',
};

const CLUBS = [
  // --- Cultural (mother club: SARAS) ---
  { name: 'SARAS', category: 'Cultural', description: 'Mother club for all cultural activities at IIIT Surat.', leadName: 'TBD', leadEmail: 'test-saras@iiitsurat.ac.in' },
  { name: 'Abstract (Art and Design Club)', category: 'Cultural', description: 'Art and design club under SARAS.', leadName: 'TBD', leadEmail: 'test-abstract@iiitsurat.ac.in' },
  { name: 'Antra (Poetry Club)', category: 'Cultural', description: 'Poetry club under SARAS.', leadName: 'TBD', leadEmail: 'test-antra@iiitsurat.ac.in' },
  { name: 'Swarang (Singing Club)', category: 'Cultural', description: 'Singing club under SARAS.', leadName: 'TBD', leadEmail: 'test-swarang@iiitsurat.ac.in' },
  { name: 'Malhar (Drama Club)', category: 'Cultural', description: 'Drama club under SARAS.', leadName: 'TBD', leadEmail: 'test-malhar@iiitsurat.ac.in' },
  { name: 'Groove (Dance Club)', category: 'Cultural', description: 'Dance club under SARAS.', leadName: 'TBD', leadEmail: 'test-groove@iiitsurat.ac.in' },
  { name: 'Cineworks (Videography Club)', category: 'Cultural', description: 'Videography club under SARAS.', leadName: 'TBD', leadEmail: 'test-cineworks@iiitsurat.ac.in' },
  { name: 'Exposure (Photography Club)', category: 'Cultural', description: 'Photography club under SARAS.', leadName: 'TBD', leadEmail: 'test-exposure@iiitsurat.ac.in' },
  { name: 'Management (Cultural Club Core Team)', category: 'Cultural', description: 'Core organizing team for SARAS and its cultural clubs.', leadName: 'TBD', leadEmail: 'test-management@iiitsurat.ac.in' },

  // --- Technical ---
  { name: 'Google Developers Group (GDG) IIIT Surat', category: 'Technical', description: 'Student-led developer community supported by Google; workshops, hackathons, and project-based learning.', leadName: 'Bhupendra Kumar', leadEmail: 'test-gdg@iiitsurat.ac.in' },
  { name: 'Modern Automation and Robotics Club (MARC)', category: 'Technical', description: 'Robotics club of IIIT Surat.', leadName: 'TBD', leadEmail: 'test-marc@iiitsurat.ac.in' },
  { name: 'Learn Code Solve (LCS)', category: 'Technical', description: 'Coding and competitive programming club of IIIT Surat.', leadName: 'TBD', leadEmail: 'test-lcs@iiitsurat.ac.in' },

  // --- Entrepreneur ---
  { name: 'Ruminate (E-Cell of IIIT Surat)', category: 'Entrepreneur', description: 'Entrepreneurship cell of IIIT Surat, founded 2019.', leadName: 'Himanshu Shekhar', leadEmail: 'test-ruminate@iiitsurat.ac.in' },

  // --- Academic ---
  { name: 'Ramanujan Mathematics Club (RMC)', category: 'Academic', description: 'Mathematics-focused club for problem-solving and analytical thinking.', leadName: 'Parth Acharya (President)', leadEmail: 'test-rmc@iiitsurat.ac.in' },
  { name: 'ASTRA (Astronomy and Astrophysics Club)', category: 'Academic', description: 'Astronomy and astrophysics club of IIIT Surat.', leadName: 'TBD', leadEmail: 'test-astra@iiitsurat.ac.in' },

  // --- Sports ---
  { name: 'Indominous Club', category: 'Sports', description: 'Sports club of IIIT Surat.', leadName: 'TBD', leadEmail: 'test-indominous@iiitsurat.ac.in' },
];

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
  console.log('Signed in. Creating clubs...\n');

  let created = 0;
  let skipped = 0;

  for (const club of CLUBS) {
    const existingQuery = query(collection(db, 'clubs'), where('name', '==', club.name));
    const existing = await getDocs(existingQuery);
    if (!existing.empty) {
      console.log(`skip   ${club.name} (already exists)`);
      skipped++;
      continue;
    }

    await addDoc(collection(db, 'clubs'), {
      name: club.name,
      category: club.category,
      description: club.description,
      leadUid: null,
      leadName: club.leadName,
      leadEmail: club.leadEmail.toLowerCase(),
      createdAt: serverTimestamp(),
    });
    console.log(`created ${club.name}`);
    created++;
  }

  console.log(`\nDone. Created ${created}, skipped ${skipped} (already existed).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err.message ?? err);
  process.exit(1);
});
