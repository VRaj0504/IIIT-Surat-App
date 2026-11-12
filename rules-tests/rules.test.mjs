import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

let env;

const STUDENT = { uid: 'stu1', email: 'ug25cse114@iiitsurat.ac.in', reg: 'UG25CSE114' };
const OTHER = { uid: 'stu2', email: 'ug25cse115@iiitsurat.ac.in', reg: 'UG25CSE115' };
const FACULTY = { uid: 'fac1', email: 'teacher@iiitsurat.ac.in' };
const DOCTOR = { uid: 'doc1', email: 'doctor@iiitsurat.ac.in' };
const COMMITTEE = { uid: 'com1', email: 'committee@iiitsurat.ac.in' };
const ADMIN = { uid: 'adm1', email: 'admin@iiitsurat.ac.in' };
const STRANGER = { uid: 'x1', email: 'someone@gmail.com' };

const as = (u) => env.authenticatedContext(u.uid, { email: u.email, email_verified: true }).firestore();

async function seed(extra) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const roster = { branch: 'CSE', section: 'A', admissionYear: 2025, name: 'S' };
    await setDoc(doc(db, 'roster', STUDENT.reg), roster);
    await setDoc(doc(db, 'roster', OTHER.reg), roster);
    await setDoc(doc(db, 'roster', 'UG25CSE116'), roster);
    await setDoc(doc(db, 'users', STUDENT.uid), { uid: STUDENT.uid, email: STUDENT.email, role: 'student', enrollmentNumber: STUDENT.reg, branch: 'CSE', section: 'A', admissionYear: 2025, phone: '1' });
    await setDoc(doc(db, 'users', OTHER.uid), { uid: OTHER.uid, email: OTHER.email, role: 'student', enrollmentNumber: OTHER.reg, branch: 'CSE', section: 'A', admissionYear: 2025, phone: '2' });
    for (const f of [FACULTY, DOCTOR, COMMITTEE]) {
      await setDoc(doc(db, 'users', f.uid), { uid: f.uid, email: f.email, role: 'faculty' });
      await setDoc(doc(db, 'allowlist', f.email), { role: 'faculty', ...(f === DOCTOR ? { nonTeaching: true } : {}) });
    }
    await setDoc(doc(db, 'users', ADMIN.uid), { uid: ADMIN.uid, email: ADMIN.email, role: 'admin' });
    await setDoc(doc(db, 'config', 'exams'), { examCellEmails: [], publishMode: 'instant' });
    await setDoc(doc(db, 'config', 'complaints'), { committeeEmails: [COMMITTEE.email] });
    if (extra) await extra(db);
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-collegego',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

describe('identity', () => {
  const NEW = { uid: 'new1', email: 'ug25cse116@iiitsurat.ac.in' };
  it('a student can claim their own enrollment number', async () => {
    await assertSucceeds(setDoc(doc(as(NEW), 'enrollmentClaims', 'UG25CSE116'), { uid: NEW.uid, claimedAt: new Date() }));
  });
  it("a student can't claim someone else's enrollment number", async () => {
    await assertFails(setDoc(doc(as(NEW), 'enrollmentClaims', OTHER.reg), { uid: NEW.uid, claimedAt: new Date() }));
  });
});

describe('profiles', () => {
  it("a student can't read another student's profile", async () => {
    await assertFails(getDoc(doc(as(STUDENT), 'users', OTHER.uid)));
  });
  it('a student can read a faculty profile and their own', async () => {
    await assertSucceeds(getDoc(doc(as(STUDENT), 'users', FACULTY.uid)));
    await assertSucceeds(getDoc(doc(as(STUDENT), 'users', STUDENT.uid)));
  });
  it('emergency contacts are private to their owner', async () => {
    await assertSucceeds(setDoc(doc(as(STUDENT), 'users', STUDENT.uid, 'private', 'sos'), { emergencyContacts: [] }));
    await assertFails(getDoc(doc(as(FACULTY), 'users', STUDENT.uid, 'private', 'sos')));
  });
});

describe('event excusals', () => {
  const base = { eventName: 'Fest', fromDate: '2026-11-01', toDate: '2026-11-02', studentEnrollmentNumbers: [STUDENT.reg], submittedBy: STUDENT.uid, status: 'pending' };
  // Requests are created by the excusalSubmit function, so tests put them in place with rules off.
  const put = (id, extra) =>
    env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'eventExcusals', id), { ...base, ...extra }));

  it('nobody can create an excusal from the app; only the server function can', async () => {
    await assertFails(setDoc(doc(as(STUDENT), 'eventExcusals', 'e1'), { ...base, facultyCoordinatorUid: FACULTY.uid }));
    await assertFails(setDoc(doc(as(FACULTY), 'eventExcusals', 'e2'), { ...base, submittedBy: FACULTY.uid }));
  });
  it("a student can't approve their own request", async () => {
    await put('e1', { facultyCoordinatorUid: FACULTY.uid });
    await assertFails(updateDoc(doc(as(STUDENT), 'eventExcusals', 'e1'), { status: 'approved' }));
  });
  it('an old one-faculty request can be finished only by that faculty member', async () => {
    await put('e1', { facultyCoordinatorUid: FACULTY.uid });
    await assertFails(updateDoc(doc(as(COMMITTEE), 'eventExcusals', 'e1'), { status: 'approved' }));
    await assertSucceeds(updateDoc(doc(as(FACULTY), 'eventExcusals', 'e1'), { status: 'approved' }));
  });
  it("a 3-signature request can't be changed from the app, even by one of its signers", async () => {
    await put('e2', { flow: 2, stage: 'fic', facultyCoordinatorUid: FACULTY.uid, approverEmails: [FACULTY.email] });
    await assertSucceeds(getDoc(doc(as(FACULTY), 'eventExcusals', 'e2')));
    await assertFails(updateDoc(doc(as(FACULTY), 'eventExcusals', 'e2'), { status: 'approved' }));
  });
});

describe('SOS', () => {
  const sos = (uid) => ({ studentUid: uid, status: 'open', type: 'medical', ackBy: null, resolvedBy: null });
  it('a non-member account cannot raise an SOS', async () => {
    await assertFails(setDoc(doc(as(STRANGER), 'sosAlerts', 's1'), sos(STRANGER.uid)));
  });
  it('a student can raise an SOS', async () => {
    await assertSucceeds(setDoc(doc(as(STUDENT), 'sosAlerts', 's1'), sos(STUDENT.uid)));
  });
});

describe('complaints', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'complaints', 'h1'), { studentUid: STUDENT.uid, category: 'Harassment', facultyEmail: null, status: 'pending', type: 'complaint' });
      await setDoc(doc(db, 'complaints', 'f1'), { studentUid: STUDENT.uid, category: 'Facilities', facultyEmail: null, status: 'pending', type: 'complaint' });
      await setDoc(doc(db, 'complaints', 'd1'), { studentUid: STUDENT.uid, category: 'Coursework', facultyEmail: null, status: 'pending', type: 'doubt' });
    });
  });
  it("ordinary faculty can't read complaints that weren't sent to them", async () => {
    await assertFails(getDoc(doc(as(FACULTY), 'complaints', 'h1')));
    await assertFails(getDoc(doc(as(FACULTY), 'complaints', 'f1')));
  });
  it('the committee and admin see every complaint', async () => {
    await assertSucceeds(getDoc(doc(as(COMMITTEE), 'complaints', 'h1')));
    await assertSucceeds(getDoc(doc(as(COMMITTEE), 'complaints', 'f1')));
    await assertSucceeds(getDocs(collection(as(COMMITTEE), 'complaints')));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'complaints', 'h1')));
  });
  it('faculty can list open doubts', async () => {
    const db = as(FACULTY);
    await assertSucceeds(getDocs(query(collection(db, 'complaints'), where('facultyEmail', '==', null), where('type', '==', 'doubt'))));
  });
  it("a student can't send a harassment complaint to a chosen faculty member", async () => {
    await assertFails(
      setDoc(doc(as(STUDENT), 'complaints', 'h2'), { studentUid: STUDENT.uid, category: 'Harassment', facultyEmail: FACULTY.email, status: 'pending', type: 'complaint', subject: 's', description: 'd' }),
    );
  });
});

describe('attendance', () => {
  const session = { branch: 'CSE', admissionYear: 2025, section: 'A', subjectCode: 'CS101', subjectName: 'X', date: '2026-10-01', absentEnrollmentNumbers: [OTHER.reg] };
  it("students can't read class attendance records directly", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'attendanceSessions', 'a1'), session));
    await assertFails(getDoc(doc(as(STUDENT), 'attendanceSessions', 'a1')));
  });
  it('teaching faculty can mark attendance, non-teaching staff cannot', async () => {
    await assertSucceeds(setDoc(doc(as(FACULTY), 'attendanceSessions', 'a2'), session));
    await assertFails(setDoc(doc(as(DOCTOR), 'attendanceSessions', 'a3'), session));
  });
  it('removing someone from the allowlist removes faculty access at once', async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'allowlist', FACULTY.email)));
    await assertFails(setDoc(doc(as(FACULTY), 'attendanceSessions', 'a4'), session));
  });
});

describe('grades', () => {
  const grade = (by, published) => ({ studentEnrollmentNumber: STUDENT.reg, subjectCode: 'CS101', grade: 'AA', credits: 4, enteredBy: by, published });
  it("non-teaching staff can't enter grades", async () => {
    await assertFails(setDoc(doc(as(DOCTOR), 'grades', 'g1'), grade(DOCTOR.uid, true)));
  });
  it('in hold mode, faculty grades stay hidden until published', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'config', 'exams'), { publishMode: 'examCell' }));
    await assertFails(setDoc(doc(as(FACULTY), 'grades', 'g1'), grade(FACULTY.uid, true)));
    await assertSucceeds(setDoc(doc(as(FACULTY), 'grades', 'g1'), grade(FACULTY.uid, false)));
    await assertFails(getDoc(doc(as(STUDENT), 'grades', 'g1')));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'grades', 'g1'), { published: true }));
    await assertSucceeds(getDoc(doc(as(STUDENT), 'grades', 'g1')));
  });
  it("a student can't read another student's grade", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'grades', 'g2'), { ...grade(FACULTY.uid, true), studentEnrollmentNumber: OTHER.reg }));
    await assertFails(getDoc(doc(as(STUDENT), 'grades', 'g2')));
  });
});

describe('medical leave chain', () => {
  const HOD = { uid: 'hod1', email: 'hod@iiitsurat.ac.in' };
  const KARTIK = { uid: 'adm2', email: 'kartik@iiitsurat.ac.in' };
  const leave = {
    studentUid: STUDENT.uid, studentName: 'S', type: 'medical', stage: 'doctor', status: 'pending', reason: 'fever for two days',
    medicalReportUrl: 'https://firebasestorage.googleapis.com/x', fromDate: '2026-11-01', toDate: '2026-11-02',
    facultyEmail: DOCTOR.email, doctorEmail: DOCTOR.email, hodEmail: HOD.email,
    deanEmail: '', jrEmail: '', administratorEmail: KARTIK.email,
  };
  const decision = (u, d) => ({ decision: d, remark: null, by: u.uid, byName: 'x' });
  beforeEach(async () => {
    await seed(async (db) => {
      for (const f of [HOD, KARTIK]) {
        await setDoc(doc(db, 'users', f.uid), { uid: f.uid, email: f.email, role: 'faculty' });
        await setDoc(doc(db, 'allowlist', f.email), { role: 'faculty' });
      }
      await setDoc(doc(db, 'config', 'medicalLeave'), {
        doctor: { name: 'Doc', email: DOCTOR.email },
        hodEmails: [HOD.email],
        dean: null, jr: null,
        administrator: { name: 'Kartik', email: KARTIK.email },
      });
    });
  });
  it("a student can't pick someone who isn't an HOD", async () => {
    await assertFails(setDoc(doc(as(STUDENT), 'leaveApplications', 'l1'), { ...leave, hodEmail: FACULTY.email }));
  });
  it('approvals go Doctor → HOD → Administrator, each only at their turn', async () => {
    await assertSucceeds(setDoc(doc(as(STUDENT), 'leaveApplications', 'l1'), leave));
    await assertFails(updateDoc(doc(as(HOD), 'leaveApplications', 'l1'), { stage: 'administrator', hodDecision: decision(HOD, 'approved') }));
    await assertSucceeds(updateDoc(doc(as(DOCTOR), 'leaveApplications', 'l1'), { stage: 'hod', doctorDecision: decision(DOCTOR, 'approved') }));
    await assertFails(updateDoc(doc(as(HOD), 'leaveApplications', 'l1'), { stage: 'teachers', status: 'approved', hodDecision: decision(HOD, 'approved') }));
    await assertSucceeds(updateDoc(doc(as(HOD), 'leaveApplications', 'l1'), { stage: 'administrator', hodDecision: decision(HOD, 'approved') }));
    await assertSucceeds(
      updateDoc(doc(as(KARTIK), 'leaveApplications', 'l1'), { stage: 'teachers', status: 'approved', administratorDecision: decision(KARTIK, 'approved') }),
    );
  });
});

describe('quizzes and mess items', () => {
  const quiz = (by) => ({
    title: 'Quiz 1', subjectCode: 'CS101', subjectName: 'X', branch: 'CSE', admissionYear: 2025, sections: [],
    date: '2026-12-01', startTime: '10:00', endTime: '11:00', syllabus: 'Unit 1', rooms: [], createdBy: by,
  });
  it('teachers post quizzes, students only read them', async () => {
    await assertSucceeds(setDoc(doc(as(FACULTY), 'quizzes', 'q1'), quiz(FACULTY.uid)));
    await assertSucceeds(getDoc(doc(as(STUDENT), 'quizzes', 'q1')));
    await assertFails(setDoc(doc(as(STUDENT), 'quizzes', 'q2'), quiz(STUDENT.uid)));
    await assertFails(updateDoc(doc(as(COMMITTEE), 'quizzes', 'q1'), { syllabus: 'changed' }));
  });
  it('only staff edit always-available mess items', async () => {
    await assertSucceeds(setDoc(doc(as(FACULTY), 'messAlwaysAvailable', 'm1'), { name: 'Idli', price: 30, order: 0 }));
    await assertFails(setDoc(doc(as(STUDENT), 'messAlwaysAvailable', 'm2'), { name: 'Idli', price: 1, order: 0 }));
    await assertSucceeds(getDoc(doc(as(STUDENT), 'messAlwaysAvailable', 'm1')));
  });
});

describe('app health', () => {
  const crash = (uid) => ({ message: 'boom', stack: 'at Home', where: 'render', screen: 'Home', platform: 'android', appVersion: '1.0.0', uid, at: new Date(), expireAt: new Date() });
  const usage = { screens: { Home: 1 }, opens: 1, updatedAt: new Date() };

  it('a signed-in user can report a crash, and only an admin can read it', async () => {
    await assertSucceeds(setDoc(doc(as(STUDENT), 'clientErrors', 'c1'), crash(STUDENT.uid)));
    await assertFails(getDoc(doc(as(STUDENT), 'clientErrors', 'c1')));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'clientErrors', 'c1')));
  });
  it("a crash report can't carry extra fields or someone else's id", async () => {
    await assertFails(setDoc(doc(as(STUDENT), 'clientErrors', 'c2'), { ...crash(STUDENT.uid), extra: 1 }));
    await assertFails(setDoc(doc(as(STUDENT), 'clientErrors', 'c3'), crash(OTHER.uid)));
  });
  it('members add to the daily usage count, and only an admin can read it', async () => {
    await assertSucceeds(setDoc(doc(as(STUDENT), 'usageDaily', '2026-11-10'), usage));
    await assertFails(setDoc(doc(as(STRANGER), 'usageDaily', '2026-11-11'), usage));
    await assertFails(setDoc(doc(as(STUDENT), 'usageDaily', 'today'), usage));
    await assertFails(getDoc(doc(as(STUDENT), 'usageDaily', '2026-11-10')));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'usageDaily', '2026-11-10')));
  });
});

describe('mess menu and class changes', () => {
  const menu = { days: [{ day: 'Monday', lunch: ['Dal', 'Rice'] }], updatedAt: new Date(), updatedBy: ADMIN.email };

  it('only an admin can save the weekly mess menu; every member can read it', async () => {
    await assertFails(setDoc(doc(as(FACULTY), 'config', 'messMenu'), menu));
    await assertSucceeds(setDoc(doc(as(ADMIN), 'config', 'messMenu'), menu));
    await assertSucceeds(getDoc(doc(as(STUDENT), 'config', 'messMenu')));
  });
  it('class changes are read by members only and never written from the app', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'classChanges', 'c1'), { date: '2026-11-10', type: 'cancelled' }));
    await assertSucceeds(getDoc(doc(as(STUDENT), 'classChanges', 'c1')));
    await assertFails(getDoc(doc(as(STRANGER), 'classChanges', 'c1')));
    await assertFails(setDoc(doc(as(FACULTY), 'classChanges', 'c2'), { date: '2026-11-10', type: 'cancelled' }));
  });
});

describe('report and block', () => {
  const report = (u, extra = {}) => ({
    kind: 'event', contentId: 'e1', title: 'Hackathon', authorUid: OTHER.uid, authorName: 'Club lead', clubName: 'Coding Club',
    reason: 'spam', reporterUid: u.uid, status: 'open', createdAt: serverTimestamp(), ...extra,
  });

  it('a member can report a post; only an admin can read or resolve reports', async () => {
    await assertSucceeds(setDoc(doc(as(STUDENT), 'contentReports', 'r1'), report(STUDENT)));
    await assertFails(getDoc(doc(as(STUDENT), 'contentReports', 'r1')));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'contentReports', 'r1')));
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'contentReports', 'r1'), { status: 'removed', resolvedBy: ADMIN.email, resolvedAt: new Date(), action: 'deleted' }));
  });
  it("a report can't be filed for someone else, with a made-up reason, or by a stranger", async () => {
    await assertFails(setDoc(doc(as(STUDENT), 'contentReports', 'r2'), report(OTHER)));
    await assertFails(setDoc(doc(as(STUDENT), 'contentReports', 'r3'), report(STUDENT, { reason: 'boring' })));
    await assertFails(setDoc(doc(as(STRANGER), 'contentReports', 'r4'), report(STRANGER)));
  });
  it('each person reads and changes only their own block list', async () => {
    await assertSucceeds(setDoc(doc(as(STUDENT), 'userBlocks', STUDENT.uid), { blocked: { [OTHER.uid]: 'Club lead' }, updatedAt: new Date() }));
    await assertSucceeds(getDoc(doc(as(STUDENT), 'userBlocks', STUDENT.uid)));
    await assertFails(getDoc(doc(as(OTHER), 'userBlocks', STUDENT.uid)));
    await assertFails(setDoc(doc(as(OTHER), 'userBlocks', STUDENT.uid), { blocked: {}, updatedAt: new Date() }));
  });
});

describe('company prep', () => {
  const sub = (u, extra = {}) => ({
    companySlug: 'amazon', newCompany: '', title: 'Sliding window max', summary: 'Given an array and k, find the max of every window of size k.',
    difficulty: 'Medium', topics: ['Sliding Window'], year: 2026, round: 'OA', role: 'SDE', platform: 'HackerRank',
    link: 'https://leetcode.com/problems/sliding-window-maximum/', status: 'pending', uid: u.uid, name: 'Student', createdAt: serverTimestamp(), ...extra,
  });
  it('a member can submit a question; only reviewers can approve it', async () => {
    await assertSucceeds(setDoc(doc(as(STUDENT), 'prepSubmissions', 's1'), sub(STUDENT)));
    await assertSucceeds(getDoc(doc(as(STUDENT), 'prepSubmissions', 's1')));
    await assertFails(getDoc(doc(as(OTHER), 'prepSubmissions', 's1')));
    await assertFails(updateDoc(doc(as(STUDENT), 'prepSubmissions', 's1'), { status: 'approved' }));
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'prepSubmissions', 's1'), { status: 'approved' }));
  });
  it("a submission can't be pre-approved or filed for someone else", async () => {
    await assertFails(setDoc(doc(as(STUDENT), 'prepSubmissions', 's2'), sub(STUDENT, { status: 'approved' })));
    await assertFails(setDoc(doc(as(STUDENT), 'prepSubmissions', 's3'), sub(OTHER)));
  });
  it('students read questions but cannot write them', async () => {
    await assertSucceeds(setDoc(doc(as(ADMIN), 'prepQuestions', 'q1'), { companySlug: 'amazon', title: 'X', source: 'campus', difficulty: 'Easy' }));
    await assertSucceeds(getDoc(doc(as(STUDENT), 'prepQuestions', 'q1')));
    await assertFails(setDoc(doc(as(STUDENT), 'prepQuestions', 'q2'), { companySlug: 'amazon', title: 'X', source: 'campus', difficulty: 'Easy' }));
  });
  it('locked summaries need Plus once the gate is on; free ones stay open', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await setDoc(doc(db, 'config', 'prep'), { plusGate: true });
      await setDoc(doc(db, 'prepQuestionDetails', 'free1'), { summary: 'a', free: true });
      await setDoc(doc(db, 'prepQuestionDetails', 'paid1'), { summary: 'b', free: false });
    });
    await assertSucceeds(getDoc(doc(as(STUDENT), 'prepQuestionDetails', 'free1')));
    await assertFails(getDoc(doc(as(STUDENT), 'prepQuestionDetails', 'paid1')));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'prepQuestionDetails', 'paid1')));
  });
  it('progress is private to its owner', async () => {
    await assertSucceeds(setDoc(doc(as(STUDENT), 'prepProgress', STUDENT.uid), { solved: { q1: 1 }, starred: {}, updatedAt: new Date() }));
    await assertFails(getDoc(doc(as(OTHER), 'prepProgress', STUDENT.uid)));
  });
});
