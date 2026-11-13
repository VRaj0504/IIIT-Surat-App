// Shared admin setup for scripts. Start a new script with:
//   const { db, auth, FieldValue, arg, flag, APPLY } = require("./lib/admin");
// (from scripts/archive use "../lib/admin")
const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp, FieldPath } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");

const KEY = path.join(__dirname, "..", "serviceAccountKey.json");
let key;
try {
  key = require(KEY);
} catch {
  console.error("Missing scripts/serviceAccountKey.json. Download it from Firebase Console → Project settings → Service accounts.");
  process.exit(1);
}

if (!getApps().length) initializeApp({ credential: cert(key), storageBucket: `${key.project_id}.firebasestorage.app` });

const args = process.argv.slice(2);
/** Positional argument n (0-based), ignoring --flags. */
const arg = (n) => args.filter((a) => !a.startsWith("--"))[n];
/** true if --name was passed. */
const flag = (name) => args.includes(`--${name}`);
/** Value of --name=value, or undefined. */
const opt = (name) => (args.find((a) => a.startsWith(`--${name}=`)) || "").split("=").slice(1).join("=") || undefined;

/** Scripts only change data when run with --apply. Without it they preview. */
const APPLY = flag("apply");

/** Find a user by email (Auth). Returns null if not found. */
async function userByEmail(email) {
  try {
    return await getAuth().getUserByEmail(String(email).trim().toLowerCase());
  } catch {
    return null;
  }
}

/** Run main(), print errors clearly, and exit. */
function run(main) {
  main()
    .then(() => {
      if (!APPLY) console.log("\nPreview only. Nothing changed. Add --apply to make the change.");
      process.exit(0);
    })
    .catch((e) => {
      console.error("\nFailed:", e.message);
      process.exit(1);
    });
}

module.exports = {
  db: getFirestore(),
  auth: getAuth(),
  storage: getStorage(),
  FieldValue,
  Timestamp,
  FieldPath,
  args,
  arg,
  flag,
  opt,
  APPLY,
  userByEmail,
  run,
};
