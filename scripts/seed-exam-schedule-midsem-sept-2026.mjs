// One-off: publishes the Mid Semester date sheet (Sept 2026) for 3rd, 5th and
// 7th semester CSE + ECE, including the Repeaters page, exactly as printed
// on "Time Table Mid Sem exam Sept 2026 (3rd, 5th & 7th ECE, CSE).pdf"
// (dated 07/09/2026). It writes the same `examSchedules` documents the
// faculty portal's PDF import would, so it's a safe fallback if that import
// is unavailable — and running it again just overwrites the same 9 docs.
//
// Run from the repo root:
//   FACULTY_EMAIL=... FACULTY_PASSWORD=... node --env-file=.env scripts/seed-exam-schedule-midsem-sept-2026.mjs
// Optional, to attach the original PDF so students can open it from the app:
//   ... PDF_PATH="/path/to/that.pdf" node --env-file=.env scripts/seed-exam-schedule-midsem-sept-2026.mjs
//
// Transcribed by hand from the scan — compare against the PDF before you
// rely on it (a few minutes: 54 rows, 9 sheets).
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp, terminate } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

if (!process.env.EXPO_PUBLIC_FIREBASE_API_KEY) {
  console.error('Missing EXPO_PUBLIC_FIREBASE_API_KEY -- run with: node --env-file=.env scripts/seed-exam-schedule-midsem-sept-2026.mjs');
  process.exit(1);
}

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: 'iiit-surat-app-6643d.firebaseapp.com',
  projectId: 'iiit-surat-app-6643d',
  storageBucket: 'iiit-surat-app-6643d.firebasestorage.app',
  messagingSenderId: '568691830636',
  appId: '1:568691830636:web:4be7fd34f4098d1d994d49',
};

// "CS514 / EC513" cells are the sheet's "Subject A OR Subject B" cells: one
// exam slot, the student sits whichever elective they took.
const GROUPS = [
  {
    branch: 'CSE', semester: 3, examType: 'midsem', examTypeLabel: 'Mid Semester',
    entries: [
      { date: '2026-09-21', startTime: '09:00', endTime: '10:00', subjectCode: 'CS301', subjectName: 'Computer Organization and Architecture', venue: '' },
      { date: '2026-09-22', startTime: '09:00', endTime: '10:00', subjectCode: 'CS302', subjectName: 'Object Oriented Programming', venue: '' },
      { date: '2026-09-23', startTime: '09:00', endTime: '10:00', subjectCode: 'CS303', subjectName: 'Programming for Problem Solving', venue: '' },
      { date: '2026-09-24', startTime: '09:00', endTime: '10:00', subjectCode: 'CS304', subjectName: 'Database Management Systems', venue: '' },
      { date: '2026-09-26', startTime: '09:00', endTime: '10:00', subjectCode: 'CS305', subjectName: 'Software Engineering', venue: '' },
      { date: '2026-09-28', startTime: '09:00', endTime: '10:00', subjectCode: 'HS301', subjectName: 'Economics & Business Management', venue: '' },
    ],
  },
  {
    branch: 'ECE', semester: 3, examType: 'midsem', examTypeLabel: 'Mid Semester',
    entries: [
      { date: '2026-09-21', startTime: '09:00', endTime: '10:00', subjectCode: 'CS301', subjectName: 'Computer Organization and Architecture', venue: '' },
      { date: '2026-09-22', startTime: '09:00', endTime: '10:00', subjectCode: 'EC301', subjectName: 'Signal and Systems', venue: '' },
      { date: '2026-09-23', startTime: '09:00', endTime: '10:00', subjectCode: 'CS303', subjectName: 'Programming for Problem Solving', venue: '' },
      { date: '2026-09-24', startTime: '09:00', endTime: '10:00', subjectCode: 'EC302', subjectName: 'Electronics Devices and Circuits', venue: '' },
      { date: '2026-09-26', startTime: '09:00', endTime: '10:00', subjectCode: 'EC303', subjectName: 'Sensors and Instrumentation', venue: '' },
      { date: '2026-09-28', startTime: '09:00', endTime: '10:00', subjectCode: 'HS301', subjectName: 'Economics & Business Management', venue: '' },
    ],
  },
  {
    branch: 'CSE', semester: 5, examType: 'midsem', examTypeLabel: 'Mid Semester',
    entries: [
      { date: '2026-09-21', startTime: '16:00', endTime: '17:00', subjectCode: 'CS501', subjectName: 'Data Science', venue: '' },
      { date: '2026-09-22', startTime: '16:00', endTime: '17:00', subjectCode: 'CS502', subjectName: 'Computer Graphics', venue: '' },
      { date: '2026-09-23', startTime: '16:00', endTime: '17:00', subjectCode: 'CS503', subjectName: 'High Performance Computing', venue: '' },
      { date: '2026-09-24', startTime: '16:00', endTime: '17:00', subjectCode: 'CS504', subjectName: 'Cloud Computing & Big Data Infrastructure', venue: '' },
      { date: '2026-09-26', startTime: '16:00', endTime: '17:00', subjectCode: 'CS514 / EC513', subjectName: 'Fuzzy & Neural Networks OR Hardware Description Languages', venue: '' },
      { date: '2026-09-28', startTime: '16:00', endTime: '17:00', subjectCode: 'HM505', subjectName: 'Innovation & Entrepreneurship', venue: '' },
    ],
  },
  {
    branch: 'ECE', semester: 5, examType: 'midsem', examTypeLabel: 'Mid Semester',
    entries: [
      { date: '2026-09-21', startTime: '16:00', endTime: '17:00', subjectCode: 'EC503', subjectName: 'Image Processing & Computer Vision', venue: '' },
      { date: '2026-09-22', startTime: '16:00', endTime: '17:00', subjectCode: 'EC502', subjectName: 'Nanoscale Device Engineering', venue: '' },
      { date: '2026-09-23', startTime: '16:00', endTime: '17:00', subjectCode: 'EC501', subjectName: 'Wireless Communication', venue: '' },
      { date: '2026-09-24', startTime: '16:00', endTime: '17:00', subjectCode: 'CS504', subjectName: 'Cloud Computing & Big Data Infrastructure', venue: '' },
      { date: '2026-09-26', startTime: '16:00', endTime: '17:00', subjectCode: 'CS514 / EC513', subjectName: 'Fuzzy & Neural Networks OR Hardware Description Languages', venue: '' },
      { date: '2026-09-28', startTime: '16:00', endTime: '17:00', subjectCode: 'HM505', subjectName: 'Innovation & Entrepreneurship', venue: '' },
    ],
  },
  {
    branch: 'CSE', semester: 7, examType: 'midsem', examTypeLabel: 'Mid Semester',
    entries: [
      { date: '2026-09-21', startTime: '09:00', endTime: '10:00', subjectCode: 'CS701', subjectName: 'Artificial Intelligence', venue: '' },
      { date: '2026-09-22', startTime: '09:00', endTime: '10:00', subjectCode: 'CS702', subjectName: 'Natural Language Processing', venue: '' },
      { date: '2026-09-23', startTime: '09:00', endTime: '10:00', subjectCode: 'CS742', subjectName: 'Cyber Security', venue: '' },
      { date: '2026-09-24', startTime: '09:00', endTime: '10:00', subjectCode: 'CS743', subjectName: 'Deep Learning', venue: '' },
      { date: '2026-09-26', startTime: '09:00', endTime: '10:00', subjectCode: 'CS753', subjectName: 'Computer Ethics & Public Policy', venue: '' },
      { date: '2026-09-28', startTime: '09:00', endTime: '10:00', subjectCode: 'EC761', subjectName: 'Internet of Things', venue: '' },
    ],
  },
  {
    branch: 'ECE', semester: 7, examType: 'midsem', examTypeLabel: 'Mid Semester',
    entries: [
      { date: '2026-09-21', startTime: '09:00', endTime: '10:00', subjectCode: 'CS701', subjectName: 'Artificial Intelligence', venue: '' },
      { date: '2026-09-22', startTime: '09:00', endTime: '10:00', subjectCode: 'EC702', subjectName: 'Electric Vehicle Technology', venue: '' },
      { date: '2026-09-23', startTime: '09:00', endTime: '10:00', subjectCode: 'CS742', subjectName: 'Cyber Security', venue: '' },
      { date: '2026-09-24', startTime: '09:00', endTime: '10:00', subjectCode: 'CS743', subjectName: 'Deep Learning', venue: '' },
      { date: '2026-09-26', startTime: '09:00', endTime: '10:00', subjectCode: 'CS753', subjectName: 'Computer Ethics & Public Policy', venue: '' },
      { date: '2026-09-28', startTime: '09:00', endTime: '10:00', subjectCode: 'EC761', subjectName: 'Internet of Things', venue: '' },
    ],
  },
  {
    branch: 'CSE', semester: 3, examType: 'midsem-repeaters', examTypeLabel: 'Mid Semester (Repeaters)',
    entries: [
      { date: '2026-09-21', startTime: '09:00', endTime: '10:00', subjectCode: 'CS301', subjectName: 'Operating System', venue: '' },
      { date: '2026-09-22', startTime: '09:00', endTime: '10:00', subjectCode: 'CS304', subjectName: 'Automata & Formal Languages', venue: '' },
      { date: '2026-09-23', startTime: '09:00', endTime: '10:00', subjectCode: 'CS303', subjectName: 'Programming for Problem Solving', venue: '' },
      { date: '2026-09-24', startTime: '09:00', endTime: '10:00', subjectCode: 'CS302', subjectName: 'Database Management Systems', venue: '' },
      { date: '2026-09-26', startTime: '16:00', endTime: '17:00', subjectCode: 'AS305', subjectName: 'Probability & Statistical Analysis', venue: '' },
      { date: '2026-09-28', startTime: '09:00', endTime: '10:00', subjectCode: 'HM306', subjectName: 'Economics & Business Management', venue: '' },
    ],
  },
  {
    branch: 'ECE', semester: 3, examType: 'midsem-repeaters', examTypeLabel: 'Mid Semester (Repeaters)',
    entries: [
      { date: '2026-09-21', startTime: '09:00', endTime: '10:00', subjectCode: 'CS301', subjectName: 'Operating System', venue: '' },
      { date: '2026-09-22', startTime: '09:00', endTime: '10:00', subjectCode: 'EC304', subjectName: 'Signals & Systems', venue: '' },
      { date: '2026-09-23', startTime: '09:00', endTime: '10:00', subjectCode: 'EC302', subjectName: 'Electrical Networks', venue: '' },
      { date: '2026-09-24', startTime: '09:00', endTime: '10:00', subjectCode: 'EC303', subjectName: 'Electronic Circuits', venue: '' },
      { date: '2026-09-26', startTime: '16:00', endTime: '17:00', subjectCode: 'AS305', subjectName: 'Probability & Statistical Analysis', venue: '' },
      { date: '2026-09-28', startTime: '09:00', endTime: '10:00', subjectCode: 'HM306', subjectName: 'Economics & Business Management', venue: '' },
    ],
  },
  {
    branch: 'CSE', semester: 7, examType: 'midsem-repeaters', examTypeLabel: 'Mid Semester (Repeaters)',
    entries: [
      { date: '2026-09-21', startTime: '09:00', endTime: '10:00', subjectCode: 'CS701', subjectName: 'Artificial Intelligence', venue: '' },
      { date: '2026-09-22', startTime: '09:00', endTime: '10:00', subjectCode: 'CS703', subjectName: 'Natural Language Processing', venue: '' },
      { date: '2026-09-23', startTime: '09:00', endTime: '10:00', subjectCode: 'CS751', subjectName: 'Block-Chain and Ledger', venue: '' },
      { date: '2026-09-24', startTime: '09:00', endTime: '10:00', subjectCode: 'CS702', subjectName: 'Network Security', venue: '' },
      { date: '2026-09-26', startTime: '09:00', endTime: '10:00', subjectCode: 'CS761', subjectName: 'Computer Ethics & Public Policy', venue: '' },
      { date: '2026-09-28', startTime: '16:00', endTime: '17:00', subjectCode: 'AE704', subjectName: 'Innovation & Entrepreneurship', venue: '' },
    ],
  },
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
  const cred = await signInWithEmailAndPassword(auth, email, password);

  let pdf = null;
  if (process.env.PDF_PATH) {
    const bytes = readFileSync(process.env.PDF_PATH);
    const name = basename(process.env.PDF_PATH);
    const fileRef = ref(getStorage(app), `examSheets/${cred.user.uid}/${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    await uploadBytes(fileRef, bytes, { contentType: 'application/pdf' });
    pdf = { url: await getDownloadURL(fileRef), name };
    console.log(`Uploaded ${name}`);
  }

  for (const g of GROUPS) {
    const id = `${g.branch}-${g.semester}-${g.examType}`;
    await setDoc(doc(db, 'examSchedules', id), {
      ...g,
      ...(pdf ? { sourcePdfUrl: pdf.url, sourcePdfName: pdf.name } : {}),
      updatedAt: serverTimestamp(),
      updatedBy: cred.user.uid,
      updatedByEmail: email,
    });
    console.log(`${id}: ${g.entries.length} exams`);
  }

  console.log(`Done — ${GROUPS.length} date sheets published.`);
  await terminate(db);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
