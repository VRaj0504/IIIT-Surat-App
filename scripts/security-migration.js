const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const WRITE = process.argv.includes("--write");
const DELETE_WRONG_CLAIMS = process.argv.includes("--delete-wrong-claims");

async function commitAll(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

async function checkEnrollmentClaims() {
  const users = await db.collection("users").where("role", "==", "student").get();
  const wrong = [];
  for (const d of users.docs) {
    const u = d.data();
    if (u.reviewer === true || !u.enrollmentNumber || !u.email) continue;
    const local = String(u.email).split("@")[0].toUpperCase();
    if (local === String(u.enrollmentNumber).toUpperCase()) continue;
    const roster = await db.collection("roster").doc(u.enrollmentNumber).get();
    if (String(roster.data()?.email ?? "").toLowerCase() === String(u.email).toLowerCase()) continue;
    wrong.push({ uid: d.id, email: u.email, enrollmentNumber: u.enrollmentNumber });
  }
  console.log(`\n1. Students whose enrollment number doesn't match their email: ${wrong.length}`);
  wrong.forEach((w) => console.log(`   ${w.email} claimed ${w.enrollmentNumber} (uid ${w.uid})`));
  if (wrong.length && DELETE_WRONG_CLAIMS && WRITE) {
    for (const w of wrong) {
      await db.recursiveDelete(db.collection("users").doc(w.uid));
      const claim = db.collection("enrollmentClaims").doc(w.enrollmentNumber);
      if ((await claim.get()).data()?.uid === w.uid) await claim.delete();
      console.log(`   removed profile + claim for ${w.email}; they must sign up again with their own number`);
    }
  } else if (wrong.length) {
    console.log("   (Check each one. If a student's real email differs from their number, add `email` to their roster doc.");
    console.log("    To remove the wrong claims, re-run with --write --delete-wrong-claims.)");
  }
}

async function checkExcusals() {
  const snap = await db.collection("eventExcusals").where("status", "==", "approved").get();
  const roleCache = new Map();
  const roleOf = async (uid) => {
    if (!uid) return null;
    if (!roleCache.has(uid)) roleCache.set(uid, (await db.collection("users").doc(uid).get()).data()?.role ?? null);
    return roleCache.get(uid);
  };
  const bad = [];
  for (const d of snap.docs) {
    const x = d.data();
    const role = await roleOf(x.facultyCoordinatorUid);
    if (role !== "faculty" || x.facultyCoordinatorUid === x.submittedBy) bad.push(d);
  }
  console.log(`\n2. Approved event excusals not approved by a faculty member: ${bad.length}`);
  bad.forEach((d) => console.log(`   ${d.id}: "${d.data().eventName}" ${d.data().fromDate}→${d.data().toDate}, ${d.data().studentEnrollmentNumbers?.length ?? 0} students`));
  if (WRITE && bad.length) {
    await commitAll(bad.map((d) => (b) => b.update(d.ref, { status: "pending", facultyRemark: "Reset: needs approval from a faculty coordinator" })));
    console.log("   reset to pending");
  }
}

async function backfillGrades() {
  const snap = await db.collection("grades").get();
  const missing = snap.docs.filter((d) => typeof d.data().published !== "boolean");
  console.log(`\n3. Grades without a published flag: ${missing.length} of ${snap.size}`);
  if (WRITE && missing.length) {
    await commitAll(missing.map((d) => (b) => b.update(d.ref, { published: true })));
    console.log("   marked as published (students keep seeing them; no notifications are sent)");
  }
}

async function backfillComplaints() {
  const snap = await db.collection("complaints").get();
  const missing = snap.docs.filter((d) => !("facultyEmail" in d.data()) || !d.data().type);
  console.log(`\n4. Complaints missing facultyEmail or type: ${missing.length}`);
  if (WRITE && missing.length) {
    await commitAll(
      missing.map((d) => (b) =>
        b.update(d.ref, {
          ...(!("facultyEmail" in d.data()) ? { facultyEmail: null } : {}),
          ...(!d.data().type ? { type: "complaint" } : {}),
        }),
      ),
    );
    console.log("   filled in so the committee and faculty see the right items");
  }
}

async function moveEmergencyContacts() {
  const snap = await db.collection("users").get();
  const withContacts = snap.docs.filter((d) => Array.isArray(d.data().emergencyContacts));
  console.log(`\n5. Users with emergency contacts on their public profile: ${withContacts.length}`);
  if (WRITE && withContacts.length) {
    await commitAll(
      withContacts.flatMap((d) => [
        (b) => b.set(d.ref.collection("private").doc("sos"), { emergencyContacts: d.data().emergencyContacts }, { merge: true }),
        (b) => b.update(d.ref, { emergencyContacts: FieldValue.delete() }),
      ]),
    );
    console.log("   moved to users/{uid}/private/sos");
  }
}

async function backfillMedicalExcusals() {
  const snap = await db.collection("leaveApplications").where("type", "==", "medical").get();
  const ops = [];
  for (const d of snap.docs) {
    const x = d.data();
    const allDates = !!x.excuseAllDates && (x.stage === "done" || x.stage === "teachers");
    const sessions = x.excusedSessions ?? [];
    if (x.stage === "rejected" || (!allDates && sessions.length === 0)) continue;
    ops.push((b) =>
      b.set(db.collection("medicalExcusals").doc(d.id), {
        studentUid: x.studentUid ?? null,
        studentName: x.studentName ?? null,
        enrollmentNumber: x.studentEnrollmentNumber ?? null,
        fromDate: x.fromDate ?? null,
        toDate: x.toDate ?? null,
        sessions: Array.from(new Set(sessions)).sort(),
        allDates,
      }),
    );
  }
  console.log(`\n6. Approved medical leaves to copy into medicalExcusals: ${ops.length}`);
  if (WRITE && ops.length) {
    await commitAll(ops);
    console.log("   copied (the portal attendance register now counts them)");
  }
}

async function ensureExamConfig() {
  const ref = db.collection("config").doc("exams");
  const snap = await ref.get();
  const mode = snap.data()?.publishMode;
  console.log(`\n7. Results publish mode: ${mode ?? "not set (defaults to instant)"}`);
  if (WRITE && !mode) {
    await ref.set({ publishMode: "instant", ...(snap.exists ? {} : { examCellEmails: [] }) }, { merge: true });
    console.log("   set to instant (exam cell can switch to 'hold' in the portal)");
  }
}

async function checkFacultyAllowlist() {
  const users = await db.collection("users").where("role", "==", "faculty").get();
  const missing = [];
  for (const d of users.docs) {
    const email = String(d.data().email ?? "").toLowerCase();
    if (!email) continue;
    const a = await db.collection("allowlist").doc(email).get();
    if (!a.exists || a.data().role !== "faculty") missing.push({ ref: db.collection("allowlist").doc(email), email, name: d.data().name ?? "" });
  }
  console.log(`\n0. Faculty accounts missing from the faculty allowlist: ${missing.length}`);
  missing.forEach((m) => console.log(`   ${m.email}`));
  console.log("   (The new rules need every faculty member on the allowlist, or they lose faculty access.)");
  if (WRITE && missing.length) {
    await commitAll(missing.map((m) => (b) => b.set(m.ref, { role: "faculty", name: m.name }, { merge: true })));
    console.log("   added to the allowlist");
  }
}

async function main() {
  console.log(WRITE ? "Applying changes…" : "Dry run — nothing will change. Add --write to apply.");
  await checkFacultyAllowlist();
  await checkEnrollmentClaims();
  await checkExcusals();
  await backfillGrades();
  await backfillComplaints();
  await moveEmergencyContacts();
  await backfillMedicalExcusals();
  await ensureExamConfig();
  console.log("\nDone.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
