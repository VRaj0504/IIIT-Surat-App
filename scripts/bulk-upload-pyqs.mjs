// Bulk-uploads PYQs organized as:
//
//   ECE/
//     END-SEM/
//       SEM-2/
//         Electronic Devices and Circuits (EDC).pdf
//         Yoga Practice (YP).pdf
//       SEM-4/
//         Analog Circuits (AC).pdf
//         ...
//     MID-SEM/
//       SEM-2/
//         ...
//
// This is a DIFFERENT shape than bulk-upload-pyqs.mjs handles (that one
// expects {SEM N}/{Subject folder}/{MID SEM|END SEM}/{file with year in
// the name}) — here exam type comes before semester, the subject lives
// in the FILENAME itself rather than a folder, and critically there's no
// year anywhere in the folder names or filenames at all. Rather than
// make one script silently auto-detect two different layouts (real risk
// of misreading one as the other), this is its own script for this
// exact shape. The exam year has to be told to it explicitly, as a
// second argument.
//
// Subject matching (curriculum lookup, fuzzy name matching, cross-
// semester detection using curriculum's CURRENT semester when a subject
// moved) works exactly like bulk-upload-pyqs.mjs — see that script's
// comments for the reasoning.
//
// Usage:
//   FACULTY_EMAIL=... FACULTY_PASSWORD=... node bulk-upload-pyqs-v2.mjs ./ECE 2024
//   FACULTY_EMAIL=... FACULTY_PASSWORD=... node bulk-upload-pyqs-v2.mjs ./ECE 2024 --confirm
//
// Defaults to a dry run.

import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyCF5YItLRNrDtNnO6MgHeLweyzeKwT7ov8',
  authDomain: 'iiit-surat-app-6643d.firebaseapp.com',
  projectId: 'iiit-surat-app-6643d',
  storageBucket: 'iiit-surat-app-6643d.firebasestorage.app',
  messagingSenderId: '568691830636',
  appId: '1:568691830636:web:4be7fd34f4098d1d994d49',
};

const ROOT_DIR = process.argv[2];
const EXAM_YEAR = Number(process.argv[3]);
const CONFIRMED = process.argv.includes('--confirm');

if (!ROOT_DIR || !EXAM_YEAR || Number.isNaN(EXAM_YEAR)) {
  console.error('Usage: node bulk-upload-pyqs-v2.mjs <path-to-branch-folder> <exam-year> [--confirm]');
  console.error('Example: node bulk-upload-pyqs-v2.mjs ./ECE 2024');
  process.exit(1);
}

const FILE_EXTENSIONS = new Set(['.pdf', '.ppt', '.pptx']);

function listDirs(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);
}

function listFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && FILE_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name);
}

// "Electronic Devices and Circuits (EDC).pdf" -> "EDC"
// Handles both "Name (ABBR).pdf" and "Name(ABBR).pdf" (no space) —
// several files in the real ECE folder have no space before the paren.
function extractCode(fileNameNoExt) {
  const match = fileNameNoExt.match(/\(([^)]+)\)\s*$/);
  return match ? match[1].trim() : null;
}

// "Electronic Devices and Circuits (EDC).pdf" -> "Electronic Devices and Circuits"
function stripCode(fileNameNoExt) {
  return fileNameNoExt.replace(/\s*\([^)]+\)\s*$/, '').trim();
}

// Tolerates spelling drift — "Database Management Systems" vs
// "DataBase Management System" — without being so loose it starts
// matching genuinely different subjects.
function normalizeForMatch(str) {
  return str
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .map((word) => (word.endsWith('s') ? word.slice(0, -1) : word))
    .filter(Boolean)
    .sort()
    .join(' ');
}

function findBestMatch(subjects, code, name) {
  if (code) {
    const byCode = subjects.find((s) => (s.code || '').trim().toUpperCase() === code.toUpperCase());
    if (byCode) return byCode;
  }
  const target = normalizeForMatch(name);
  return subjects.find((s) => normalizeForMatch(s.name || '') === target) || null;
}

function examTypeLabel(folderName) {
  const upper = folderName.toUpperCase();
  if (upper.includes('MID')) return 'Mid Sem';
  if (upper.includes('END')) return 'End Sem';
  return folderName;
}

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
  const storage = getStorage(app);

  console.log(`Signing in as ${email}...`);
  await signInWithEmailAndPassword(auth, email, password);
  const uid = auth.currentUser.uid;
  const profileSnap = await getDoc(doc(db, 'users', uid));
  const uploadedByName = profileSnap.exists() ? profileSnap.data().name : email;
  console.log(`Signed in as ${uploadedByName}.\n`);

  const branch = path.basename(path.resolve(ROOT_DIR)).toUpperCase();
  console.log(`Branch (from folder name): ${branch}`);
  console.log(`Exam year (given): ${EXAM_YEAR}\n`);

  // Fetched once for the whole branch — lets a subject that moved
  // semesters in a curriculum revision still be found and correctly
  // re-assigned to its CURRENT semester, same reasoning as
  // bulk-upload-pyqs.mjs.
  const curriculumSnap = await getDocs(query(collection(db, 'curriculum'), where('branch', '==', branch)));
  const allCurriculum = curriculumSnap.docs.map((d) => d.data());
  const bySemester = new Map();
  allCurriculum.forEach((s) => {
    if (!bySemester.has(s.semester)) bySemester.set(s.semester, []);
    bySemester.get(s.semester).push(s);
  });
  for (const [sem, subs] of bySemester) {
    console.log(
      `(curriculum for ${branch} sem ${sem} has ${subs.length} entrie(s): ` +
        subs.map((s) => `${s.code || '<no code>'}="${s.name}"`).join(', ') +
        ')',
    );
  }
  console.log();

  const plan = [];
  const unmatchedSubjectFiles = new Set();
  const crossSemesterMismatches = new Set();

  for (const examFolder of listDirs(ROOT_DIR)) {
    const label = examTypeLabel(examFolder);
    const examDir = path.join(ROOT_DIR, examFolder);

    for (const semFolder of listDirs(examDir)) {
      const semMatch = semFolder.match(/SEM.?(\d+)/i);
      if (!semMatch) {
        console.warn(`Skipping "${examFolder}/${semFolder}" — doesn't look like a "SEM-N" folder.`);
        continue;
      }
      const semester = Number(semMatch[1]);
      const semDir = path.join(examDir, semFolder);
      const curriculumSubjects = bySemester.get(semester) || [];

      for (const fileName of listFiles(semDir)) {
        const stem = path.basename(fileName, path.extname(fileName));
        const code = extractCode(stem);
        const rawName = stripCode(stem);

        const matched = findBestMatch(curriculumSubjects, code, rawName);
        let crossSemesterHit = null;
        if (!matched) {
          crossSemesterHit = findBestMatch(allCurriculum, code, rawName);
          if (crossSemesterHit) {
            crossSemesterMismatches.add(
              `${examFolder}/${semFolder}: "${fileName}" — curriculum has this as ${crossSemesterHit.code}="${crossSemesterHit.name}" under Sem ${crossSemesterHit.semester}, not Sem ${semester}. Uploading under Sem ${crossSemesterHit.semester}.`,
            );
          } else {
            unmatchedSubjectFiles.add(`Sem ${semester}: "${fileName}"`);
          }
        }

        const subjectName = matched ? matched.name : crossSemesterHit ? crossSemesterHit.name : rawName;
        const effectiveSemester = matched ? semester : crossSemesterHit ? crossSemesterHit.semester : semester;

        plan.push({
          filePath: path.join(semDir, fileName),
          fileName,
          subject: subjectName,
          branch,
          semester: effectiveSemester,
          examYear: EXAM_YEAR,
          title: `${label} ${EXAM_YEAR}`,
          matched: !!matched,
          crossSemesterHit,
        });
      }
    }
  }

  console.log(`Found ${plan.length} PYQ file(s) to upload:\n`);
  plan.forEach((p) => {
    let flag = '';
    if (!p.matched && p.crossSemesterHit) {
      flag = `  ⚠ curriculum has this under Sem ${p.semester} (not the folder's own semester) — uploading here instead, see below`;
    } else if (!p.matched) {
      flag = '  ⚠ subject not found in curriculum at all — using filename as-is';
    }
    console.log(`  [${p.branch} sem ${p.semester}] ${p.subject} — ${p.title}${flag}`);
  });

  if (crossSemesterMismatches.size > 0) {
    console.log(`\n⚠ ${crossSemesterMismatches.size} subject(s) exist in curriculum, but under a DIFFERENT semester than this folder puts them:`);
    crossSemesterMismatches.forEach((s) => console.log(`  - ${s}`));
    console.log('These upload under CURRICULUM\'s current semester, not the folder\'s.');
  }

  if (unmatchedSubjectFiles.size > 0) {
    console.log(`\n⚠ ${unmatchedSubjectFiles.size} file(s) don't match any curriculum subject, any semester:`);
    unmatchedSubjectFiles.forEach((s) => console.log(`  - ${s}`));
    console.log('These will still upload (using the filename as-is), but will likely land in "Other".');
  }

  if (!CONFIRMED) {
    console.log('\nDry run complete. Re-run with --confirm to actually upload all of this.');
    return;
  }

  console.log('\nUploading...\n');
  let uploaded = 0;
  let skipped = 0;
  for (const p of plan) {
    const existing = await getDocs(
      query(
        collection(db, 'resources'),
        where('branch', '==', p.branch),
        where('semester', '==', p.semester),
        where('subject', '==', p.subject),
        where('type', '==', 'PYQ'),
        where('examYear', '==', p.examYear),
        where('title', '==', p.title),
      ),
    );
    if (!existing.empty) {
      console.log(`skip   ${p.subject} — ${p.title} (already uploaded)`);
      skipped++;
      continue;
    }

    const fileBuffer = fs.readFileSync(p.filePath);
    const ext = path.extname(p.fileName);
    const storagePath = `resources/${p.branch}/${p.semester}/${p.subject}/${Date.now()}-${p.fileName}`;
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, fileBuffer, {
      contentType: ext === '.pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      cacheControl: 'public,max-age=31536000,immutable',
    });
    const fileUrl = await getDownloadURL(fileRef);

    await addDoc(collection(db, 'resources'), {
      title: p.title,
      subject: p.subject,
      branch: p.branch,
      semester: p.semester,
      section: null,
      type: 'PYQ',
      examYear: p.examYear,
      fileUrl,
      storagePath,
      uploadedBy: uid,
      uploadedByName,
      createdAt: serverTimestamp(),
    });
    console.log(`done   ${p.subject} — ${p.title}`);
    uploaded++;
  }

  console.log(`\nUploaded ${uploaded}, skipped ${skipped} (already present).`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
