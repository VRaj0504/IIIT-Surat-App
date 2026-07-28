

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Same public client config as src/firebase/config.ts
if (!process.env.EXPO_PUBLIC_FIREBASE_API_KEY) {
  console.error('Missing EXPO_PUBLIC_FIREBASE_API_KEY -- run with: node --env-file=.env scripts/seed-timetable.mjs');
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


// room, and (only for parallel lab blocks) which group it's for.
function slot(startTime, endTime, subjectCode, subjectName, faculty, room, group) {
  const id = `${startTime}-${subjectCode}${group ? `-${group.replace(/\s+/g, '')}` : ''}`;
  return { id, startTime, endTime, subjectCode, subjectName, faculty, room, ...(group ? { group } : {}) };
}

const CSE1_DAYS = [
  {
    day: 'Monday',
    slots: [
      slot('9:00', '10:00', 'CS304', 'DMS', 'RRP', 'CR 4'),
      slot('10:00', '11:00', 'CS305', 'SE', 'TG', 'CR 4'),
      slot('11:00', '12:00', 'CS303', 'PPS', 'RN', 'CR 4'),
      slot('13:00', '14:00', 'HS301', 'EBM', 'HS-F1', 'CR 4'),
    ],
  },
  {
    day: 'Tuesday',
    slots: [
      slot('9:00', '11:00', 'CS302', 'OOP Lab', 'DN/PJM', 'CSE LAB 1', 'Group 1'),
      slot('9:00', '11:00', 'CS303', 'PPS Lab', 'RN/PG25CS07', 'CSE LAB 2', 'Group 2'),
      slot('11:00', '12:00', 'CS302', 'OOP', 'DN', 'CR 4'),
      slot('14:00', '15:00', 'CS301', 'COA', 'PJM', 'CR 4'),
      slot('15:00', '16:00', 'CS304', 'DMS', 'RRP', 'CR 4'),
    ],
  },
  {
    day: 'Wednesday',
    slots: [
      slot('10:00', '11:00', 'CS301', 'COA', 'PJM', 'CR 4'),
      slot('11:00', '12:00', 'CS305', 'SE', 'TG', 'CR 4'),
      slot('13:00', '14:00', 'HS301', 'EBM', 'HS-F2', 'CR 4'),
      slot('14:00', '15:00', 'CS302', 'OOP', 'DN', 'CR 4'),
      slot('15:00', '16:00', 'CS304', 'DMS', 'RRP', 'CR 4'),
    ],
  },
  {
    day: 'Thursday',
    slots: [
      slot('9:00', '11:00', 'CS304', 'DMS Lab', 'RRP/TG/PG25CS11', 'CSE LAB 2', 'Group 1'),
      slot('9:00', '11:00', 'CS302', 'OOP Lab', 'DN/PJM', 'CSE LAB 1', 'Group 2'),
      slot('11:00', '12:00', 'CS303', 'PPS', 'RN', 'CR 4'),
      slot('13:00', '14:00', 'CS301', 'COA', 'PJM', 'CR 4'),
    ],
  },
  {
    day: 'Friday',
    slots: [
      slot('10:00', '11:00', 'CS305', 'SE', 'TG', 'CR 4'),
      slot('11:00', '12:00', 'CS303', 'PPS', 'RN', 'CR 4'),
      slot('13:00', '15:00', 'CS304', 'DMS Lab', 'RRP/TG/PG25CS11', 'CSE LAB 1', 'Group 1'),
      slot('13:00', '15:00', 'CS303', 'PPS Lab', 'RN/PG25CS07', 'CSE LAB 2', 'Group 2'),
      slot('15:00', '16:00', 'CS302', 'OOP', 'DN', 'CR 4'),
    ],
  },
  { day: 'Saturday', slots: [] },
];

const CSE2_DAYS = [
  {
    day: 'Monday',
    slots: [
      slot('9:00', '11:00', 'CS303', 'PPS Lab', 'RN/PG25CS04', 'CSE LAB 2', 'Group 1'),
      slot('9:00', '11:00', 'CS302', 'OOP Lab', 'DN/PG25CS11', 'CSE LAB 1', 'Group 2'),
      slot('11:00', '12:00', 'CS304', 'DMS', 'RRP', 'CR 5'),
      slot('13:00', '14:00', 'HS301', 'EBM', 'HS-F2', 'CR 5'),
      slot('14:00', '15:00', 'CS303', 'PPS', 'RN', 'CR 5'),
    ],
  },
  {
    day: 'Tuesday',
    slots: [
      slot('10:00', '11:00', 'CS305', 'SE', 'TG', 'CR 5'),
      slot('11:00', '12:00', 'CS304', 'DMS', 'RRP', 'CR 5'),
      slot('13:00', '15:00', 'CS304', 'DMS Lab', 'RRP/TG/PG25CS03', 'CSE LAB 1', 'Group 1'),
      slot('13:00', '15:00', 'CS303', 'PPS Lab', 'RN/PG25CS04', 'CSE LAB 2', 'Group 2'),
      slot('15:00', '16:00', 'CS303', 'PPS', 'RN', 'CR 5'),
    ],
  },
  {
    day: 'Wednesday',
    slots: [
      slot('9:00', '11:00', 'CS302', 'OOP Lab', 'DN/PG25CS11', 'CSE LAB 1', 'Group 1'),
      slot('9:00', '11:00', 'CS304', 'DMS Lab', 'RRP/TG/PG25CS03', 'CSE LAB 2', 'Group 2'),
      slot('11:00', '12:00', 'CS302', 'OOP', 'DN', 'CR 5'),
      slot('13:00', '14:00', 'CS301', 'COA', 'MR', 'CR 5'),
      slot('14:00', '15:00', 'CS303', 'PPS', 'RN', 'CR 5'),
      slot('15:00', '16:00', 'HS301', 'EBM', 'HS-F1', 'CR 5'),
    ],
  },
  {
    day: 'Thursday',
    slots: [
      slot('11:00', '12:00', 'CS302', 'OOP', 'DN', 'CR 5'),
      slot('13:00', '14:00', 'CS301', 'COA', 'MR', 'CR 5'),
      slot('15:00', '16:00', 'CS305', 'SE', 'TG', 'CR 5'),
    ],
  },
  {
    day: 'Friday',
    slots: [
      slot('9:00', '10:00', 'CS301', 'COA', 'MR', 'CR 5'),
      slot('11:00', '12:00', 'CS304', 'DMS', 'RRP', 'CR 5'),
      slot('13:00', '14:00', 'CS302', 'OOP', 'DN', 'CR 5'),
      slot('15:00', '16:00', 'CS305', 'SE', 'TG', 'CR 5'),
    ],
  },
  { day: 'Saturday', slots: [] },
];


const ECE3_DAYS = [
  {
    day: 'Monday',
    slots: [
      slot('9:00', '10:00', 'CS301', 'COA', 'MR', 'CR 3'),
      slot('10:00', '11:00', 'CS303', 'PPS', 'CSE-F3', 'CR 3'),
      slot('11:00', '12:00', 'EC302', 'EDC', 'SKS', 'CR 3'),
      slot('13:00', '14:00', 'EC301', 'SS', 'LC', 'CR 3'),
      slot('14:00', '15:00', 'EC303', 'S&I', 'VAP', 'CR 3'),
      slot('15:00', '16:00', 'HS301', 'EBM', 'HS-F2', 'CR 3'),
    ],
  },
  {
    day: 'Tuesday',
    slots: [
      slot('9:00', '11:00', 'CS303', 'PPS Lab', 'CSE-F3/PG25CS01', 'CSE LAB 3', 'Group 1'),
      slot('9:00', '11:00', 'EC301', 'SS Lab', 'SVR/LC', 'ECE LAB 2', 'Group 2'),
      slot('11:00', '12:00', 'CS303', 'PPS', 'CSE-F3', 'CR 3'),
      slot('13:00', '14:00', 'EC303', 'S&I', 'VAP', 'CR 3'),
      slot('14:00', '15:00', 'EC302', 'EDC', 'SKS', 'CR 3'),
    ],
  },
  {
    day: 'Wednesday',
    slots: [
      slot('9:00', '11:00', 'EC302', 'EDC Lab', 'NA/SKS', 'ECE LAB 2', 'Group 2'),
      slot('9:00', '11:00', 'EC302', 'EDC Lab', 'NA/SKS', 'ECE LAB 3', 'Group 1'),
      slot('13:00', '14:00', 'HS301', 'EBM', 'HS-F1', 'CR 3'),
      slot('14:00', '15:00', 'EC301', 'SS', 'LC', 'CR 3'),
      slot('15:00', '16:00', 'CS301', 'COA', 'MR', 'CR 3'),
    ],
  },
  {
    day: 'Thursday',
    slots: [
      slot('9:00', '11:00', 'EC302', 'EDC Lab', 'NA/SKS', 'ECE LAB 3', 'Group 1'),
      slot('9:00', '11:00', 'EC303', 'S&I Lab', 'SRS/VAP', 'CSE LAB 3', 'Group 2'),
      slot('13:00', '14:00', 'EC302', 'EDC', 'SKS', 'CR 3'),
      slot('14:00', '15:00', 'EC303', 'S&I', 'VAP', 'CR 3'),
    ],
  },
  {
    day: 'Friday',
    slots: [
      slot('9:00', '11:00', 'EC301', 'SS Lab', 'SVR/LC', 'ECE LAB 3', 'Group 1'),
      slot('9:00', '11:00', 'CS303', 'PPS Lab', 'CSE-F3/PG25CS01', 'CSE LAB 2', 'Group 2'),
      slot('11:00', '12:00', 'CS301', 'COA', 'MR', 'CR 3'),
      slot('13:00', '14:00', 'CS303', 'PPS', 'CSE-F3', 'CR 3'),
      slot('14:00', '15:00', 'EC301', 'SS', 'LC', 'CR 3'),
    ],
  },
  { day: 'Saturday', slots: [] },
];


const CSE5_DAYS = [
  {
    day: 'Monday',
    slots: [
      slot('10:00', '11:00', 'CS503', '', 'CSE F5', 'CR 2'),
      slot('11:00', '12:00', 'CS504', '', 'CSE F4', 'CR 2'),
      slot('14:00', '15:00', 'HM505', '', 'HS F2', 'CR 2'),
      slot('15:00', '17:00', 'CS504', '', 'CSE F4/PG25CS08', 'CSE Lab 1', 'Group 1'),
      slot('15:00', '17:00', 'CS502', '', 'CSE F5/PG25CS06', 'CSE Lab 2', 'Group 2'),
    ],
  },
  {
    day: 'Tuesday',
    slots: [
      slot('11:00', '12:00', 'CS503', '', 'CSE F5', 'CR 2'),
      slot('12:00', '13:00', 'CS514', '', 'SRS', 'CR 2'),
      slot('14:00', '15:00', 'CS501', '', 'CSE F5', 'CR 2'),
      slot('15:00', '16:00', 'CS502', '', 'CSE F3', 'CR 2'),
    ],
  },
  {
    day: 'Wednesday',
    slots: [
      slot('10:00', '11:00', 'CS501', '', 'CSE F5', 'CR 2'),
      slot('11:00', '12:00', 'CS502', '', 'CSE F3', 'CR 2'),
      slot('12:00', '13:00', 'CS504', '', 'CSE F4', 'CR 2'),
      slot('14:00', '15:00', 'HM505', '', 'HS F2', 'CR 2'),
      slot('15:00', '17:00', 'CS502', '', 'CSE F3', 'CSE Lab 1', 'Group 1'),
      slot('15:00', '17:00', 'CS503', '', 'CSE F5/RN/PG25CS04', 'CSE Lab 3', 'Group 2'),
    ],
  },
  {
    day: 'Thursday',
    slots: [
      slot('10:00', '11:00', 'CS501', '', 'CSE F5', 'CR 2'),
      slot('11:00', '12:00', 'CS514', '', 'SRS', 'CR 2'),
      slot('14:00', '15:00', 'CS502', '', 'CSE F3', 'CR 2'),
      slot('15:00', '17:00', 'CS503', '', 'CSE F5/RN/PG25CS04', 'CSE Lab 2', 'Group 1'),
      slot('15:00', '17:00', 'CS502', '', 'CSE F3', 'CSE Lab 1', 'Group 2'),
    ],
  },
  {
    day: 'Friday',
    slots: [
      slot('11:00', '12:00', 'CS514', '', 'SRS', 'CR 2'),
      slot('12:00', '13:00', 'CS503', '', 'CSE F5', 'CR 2'),
      slot('14:00', '15:00', 'CS504', '', 'CSE F4', 'CR 2'),
      slot('15:00', '17:00', 'CS501', '', 'CSE F5/PG25CS06', 'CSE Lab 2', 'Group 1'),
      // Source PDF literally lists "Group1" for this lab too (not Group2) -- verify against the original if that looks wrong.
      slot('15:00', '17:00', 'CS504', '', 'CSE F4/PG25CS08', 'CSE Lab 1', 'Group 1'),
    ],
  },
  { day: 'Saturday', slots: [] },
];

const ECE5_DAYS = [
  {
    day: 'Monday',
    slots: [
      slot('10:00', '11:00', 'EC501', '', 'SM', 'CR 1'),
      slot('11:00', '12:00', 'CS514', '', 'SRS', 'CR 1'),
      slot('12:00', '13:00', 'EC503', '', 'HG', 'CR 1'),
      slot('14:00', '15:00', 'HM505', '', 'HS F1', 'CR 1'),
    ],
  },
  {
    day: 'Tuesday',
    slots: [
      slot('10:00', '11:00', 'CS514', '', 'SRS', 'CR 1'),
      slot('11:00', '12:00', 'CS504', '', 'CSE F4', 'CR 1'),
      slot('12:00', '13:00', 'EC503', '', 'HG', 'CR 1'),
      slot('14:00', '15:00', 'EC9103/EC502', '', 'RDM', 'CR 1'),
      slot('15:00', '17:00', 'EC501', '', 'SM/SKS', 'ECE Lab 3', 'Group 1'),
      slot('15:00', '17:00', 'CS504', '', 'CSE F1/CSE F4/PG25CS06', 'CSE Lab 3', 'Group 2'),
    ],
  },
  {
    day: 'Wednesday',
    slots: [
      slot('11:00', '12:00', 'EC503', '', 'HG', 'CR 1'),
      slot('12:00', '13:00', 'EC9103/EC502', '', 'RDM', 'CR 1'),
      slot('14:00', '15:00', 'HM505', '', 'HS F2', 'CR 1'),
      slot('15:00', '17:00', 'CS504', '', 'CSE F1/CSE F4/PG25CS06', 'CSE Lab 3', 'Group 1'),
      slot('15:00', '17:00', 'EC503', '', 'HG/RP', 'ECE Lab 3', 'Group 2'),
    ],
  },
  {
    day: 'Thursday',
    slots: [
      slot('10:00', '11:00', 'CS504', '', 'CSE F4', 'CR 1'),
      slot('13:00', '14:00', 'CS514', '', 'SRS', 'CR 1'),
      slot('14:00', '15:00', 'EC501', '', 'SM', 'CR 1'),
      slot('15:00', '17:00', 'EC503', '', 'HG/RP', 'ECE Lab 3', 'Group 1'),
      slot('15:00', '17:00', 'EC501', '', 'SM/SKS', 'ECE Lab 3', 'Group 2'),
    ],
  },
  {
    day: 'Friday',
    slots: [
      slot('10:00', '11:00', 'EC501', '', 'SM', 'CR 1'),
      slot('11:00', '12:00', 'CS504', '', 'CSE F4', 'CR 1'),
      slot('12:00', '13:00', 'EC9103/EC502', '', 'RDM', 'CR 1'),
    ],
  },
  { day: 'Saturday', slots: [] },
];

const TIMETABLES = [
  { branch: 'CSE', semester: 3, section: 'CSE1', days: CSE1_DAYS },
  { branch: 'CSE', semester: 3, section: 'CSE2', days: CSE2_DAYS },
  { branch: 'ECE', semester: 3, section: 'ECE', days: ECE3_DAYS },
  { branch: 'CSE', semester: 5, section: 'CSE', days: CSE5_DAYS },
  { branch: 'ECE', semester: 5, section: 'ECE', days: ECE5_DAYS },
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
  console.log('Signed in. Uploading timetables...\n');

  for (const tt of TIMETABLES) {
    const docId = `${tt.branch}-${tt.semester}-${tt.section}`;
    await setDoc(doc(db, 'timetable', docId), {
      branch: tt.branch,
      semester: tt.semester,
      section: tt.section,
      days: tt.days,
      updatedAt: serverTimestamp(),
    });
    console.log(`uploaded ${docId}`);
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err.message ?? err);
  process.exit(1);
});
