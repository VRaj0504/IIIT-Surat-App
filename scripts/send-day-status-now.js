const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
initializeApp({ credential: cert(require("./serviceAccountKey.json")) });
const db = getFirestore();

async function main() {
  const reason = process.argv[2];
  const onlyEmail = (process.argv[3] || "").toLowerCase();
  if (!reason) { console.error('Usage: node scripts/send-day-status-now.js "Holiday name" [email]'); process.exit(1); }

  const snap = await db.collection("users").where("role", "in", ["student", "faculty"]).get();
  const users = snap.docs.map((d) => d.data()).filter((u) => !onlyEmail || (u.email || "").toLowerCase() === onlyEmail);
  const withToken = users.filter((u) => u.expoPushToken && u.notificationPreferences?.classReminders !== false);
  console.log(`${users.length} user(s) matched, ${withToken.length} have a push token with class reminders on.`);
  if (onlyEmail && !users.length) console.log("→ No user with that email and role student/faculty (check the role field in users/).");
  if (onlyEmail && users.length && !withToken.length) {
    const u = users[0];
    console.log(u.expoPushToken ? "→ Class reminders are turned off for this user." : "→ No expoPushToken. Open the installed app (not Expo Go), allow notifications, sign in again.");
  }

  const tokens = withToken.map((u) => u.expoPushToken);
  let ok = 0, failed = 0;
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(chunk.map((to) => ({ to, title: "No classes today", body: `Holiday today: ${reason}.`, sound: "default", priority: "high" }))),
    });
    const json = await res.json();
    (json.data || []).forEach((t, j) => {
      if (t.status === "ok") ok++;
      else { failed++; console.log(`✗ ${chunk[j]}: ${t.message} ${t.details?.error ?? ""}`); }
    });
    if (json.errors) console.log("Expo errors:", JSON.stringify(json.errors));
  }
  console.log(`Sent: ${ok} ok, ${failed} failed.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
