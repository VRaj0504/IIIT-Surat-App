// Creates (or resets) the single app-store reviewer login.
//
//   node scripts/create-reviewer.js "SomeStrongPassword123"
//
// Email: reviewer@collegego.app  (the only non-institute address the app accepts)
// Signs in as a CSE2 (2025 batch) student "App Reviewer", UG25CSE999, so the
// reviewer sees a real timetable, notices and attendance. It is hidden from
// faculty class lists, and SOS from it runs in demo mode (nobody is alerted).
// Needs serviceAccountKey.json, and Email/Password enabled in
// Firebase Console → Authentication → Sign-in method.

const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
initializeApp({ credential: cert(require("./serviceAccountKey.json")) });

const EMAIL = "reviewer@collegego.app";
const REG = "UG25CSE999";
const STUDENT = { name: "App Reviewer", branch: "CSE", section: "CSE2", admissionYear: 2025 };

async function main() {
  const password = process.argv[2];
  if (!password || password.length < 10) {
    console.error('Give a password of at least 10 characters:  node scripts/create-reviewer.js "YourPassword"');
    process.exit(1);
  }
  const auth = getAuth();
  const db = getFirestore();

  let user;
  try {
    user = await auth.getUserByEmail(EMAIL);
    await auth.updateUser(user.uid, { password, emailVerified: true, disabled: false, displayName: STUDENT.name });
    console.log("Reviewer existed — password reset.");
  } catch {
    user = await auth.createUser({ email: EMAIL, password, emailVerified: true, displayName: STUDENT.name });
    console.log("Reviewer account created.");
  }
  await auth.setCustomUserClaims(user.uid, { role: "student" });

  await db.collection("roster").doc(REG).set({ ...STUDENT, reviewer: true }, { merge: true });
  await db.collection("users").doc(user.uid).set(
    {
      uid: user.uid,
      email: EMAIL,
      role: "student",
      enrollmentNumber: REG,
      ...STUDENT,
      reviewer: true,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  console.log(`\nReady. Give the stores this login:\n  Email:    ${EMAIL}\n  Password: ${password}\n`);
  console.log('Note for reviewers: "On the login screen, enter the email and password above in the ID / password boxes and tap Log in (not Continue with Google). SOS on this account is in demo mode — no real alerts are sent."');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
