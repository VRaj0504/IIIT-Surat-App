const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
initializeApp({ credential: cert(require("./serviceAccountKey.json")) });
const db = getFirestore();

const T = [
  ["announcement", "Announcement from Dr. Test Faculty", "Tomorrow's CN lab is shifted to C-301.", "Announcements"],
  ["notice", "New notice: Mid-sem exam guidelines", "Carry your ID card. Phones are not allowed in the hall.", "Notices"],
  ["clubEvent", "LCS event", "Code Sprint 3.0", "Events"],
  ["resource", "New resource uploaded", "CS301: Unit 3 notes", "Resources"],
  ["marks", "Mid-sem marks are out", "Computer Networks (CS301) — tap to see your score.", "Marks"],
  ["grade", "New grade posted", "Computer Networks — open Transcript to see it.", "Transcript"],
  ["timetable", "Timetable updated", "CSE Sem 3 B — check what's changed.", "Timetable"],
  ["examSchedule", "Mid-sem date sheet published", "CSE Semester 3 — check your exam dates.", "ExamSchedule"],
  ["examEvent", "Exam registration", "Supplementary exam — register in CollegeGo before the deadline.", "ExamStatus"],
  ["quiz", "New quiz: CN Quiz 2", "Mon 3 Nov, 10:00 AM–10:30 AM · Your room: C-202. Tap for syllabus and seating.", "ExamSchedule"],
  ["holiday", "Holiday on Wed 5 Nov", "Guru Nanak Jayanti — no classes that day.", "AcademicCalendar"],
  ["dayStatus", "No classes today", "Holiday today: Guru Nanak Jayanti.", "AcademicCalendar"],
  ["classReminder", "Class in 10 minutes", "Computer Networks • Room C-301 • 11:00 AM–11:55 AM", "Timetable", "class-reminders"],
  ["leave", "Leave Approved", "Dr. Test Faculty approved your Casual leave request.", "ApplyLeave"],
  ["medicalLeave", "Medical leave approved", "Your medical leave for 3–4 Nov is approved.", "ApplyLeave"],
  ["complaint", "Complaint Resolved", "Admin marked resolved your complaint \"Fan not working in C-202\".", "Complaints"],
  ["excusal", "Excusal Approved", "Dr. Test Faculty approved the excusal request for \"Code Sprint 3.0\".", "SubmitEventExcusal"],
  ["lostFound", "Lost & Found", "A student messaged you on WhatsApp about \"Blue water bottle\"", "LostFound"],
  ["meeting", "Meeting: Meeting with class representatives", "Prof. Director has called a meeting. Tue 3 Nov, 11:00 AM–12:00 PM · Director's office. Tap to confirm you've seen it.", "Meetings"],
  ["counselling", "New counselling request", "A student has requested to talk to someone — check the app when you can.", "CounsellingQueue"],
  ["sosAck", "Help is on the way", "A responder has seen your SOS and is coming. Stay where you are if it's safe.", "SOS", "sos"],
  ["sosAlert", "🚨 SOS — Medical: Test Student", "Test Student, CSE2. No location — tap to call.", "SosAlerts", "sos"],
];

async function main() {
  const [email, ...rest] = process.argv.slice(2);
  const gapArg = rest.find((a) => a.startsWith("--gap="));
  const gap = Number(gapArg ? gapArg.split("=")[1] : 6) * 1000;
  const picks = rest.filter((a) => !a.startsWith("--"));
  if (!email || picks[0] === "list") {
    console.log("Usage: node scripts/test-notifications.js <your-email> [all | key key ...] [--gap=6]\nKeys:");
    T.forEach(([k, t, , s, c]) => console.log(`  ${k.padEnd(14)} ${t}  → opens ${s}${c ? `  (${c} channel)` : ""}`));
    process.exit(email ? 0 : 1);
  }
  const list = !picks.length || picks.includes("all") ? T : T.filter(([k]) => picks.includes(k));
  const bad = picks.filter((p) => p !== "all" && !T.some(([k]) => k === p));
  if (bad.length) { console.log(`Unknown key(s): ${bad.join(", ")}. Run with "list" to see keys.`); process.exit(1); }

  const snap = await db.collection("users").where("email", "==", email.toLowerCase()).limit(1).get();
  if (snap.empty) { console.log(`No user with email ${email}`); process.exit(1); }
  const u = snap.docs[0].data();
  const tokens = [...new Set([u.expoPushToken, ...(u.expoPushTokens || [])].filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken")))];
  if (!tokens.length) { console.log("No device token. Open the installed app (not Expo Go), allow notifications, sign in again."); process.exit(1); }
  console.log(`Sending ${list.length} test notification(s) to ${u.name || email} on ${tokens.length} device(s), every ${gap / 1000}s. Only you get these.\n`);

  let ok = 0, failed = 0;
  for (let i = 0; i < list.length; i++) {
    const [key, title, body, screen, channelId = "updates"] = list[i];
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(tokens.map((to) => ({ to, title: `[TEST] ${title}`, body, sound: "default", priority: "high", channelId, data: { screen, test: true } }))),
    });
    const json = await res.json().catch(() => ({}));
    const tickets = json.data || [];
    const good = tickets.filter((t) => t.status === "ok").length;
    ok += good; failed += tokens.length - good;
    const err = tickets.find((t) => t.status !== "ok");
    console.log(`${String(i + 1).padStart(2)}. ${good === tokens.length ? "✓" : "✗"} ${key.padEnd(14)} → tap should open ${screen}${err ? `   ${err.message} ${err.details?.error ?? ""}` : ""}${json.errors ? `   ${JSON.stringify(json.errors)}` : ""}`);
    if (i < list.length - 1) await new Promise((r) => setTimeout(r, gap));
  }
  console.log(`\nDone: ${ok} delivered to Expo, ${failed} failed.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
