// Fixes a club's name everywhere it is stored: the club itself, sub-club descriptions,
// its events, and excusal requests that mention it.
//
//   node scripts/rename-club.js "Indominous Club" "Indominus Club"            -> shows what would change
//   node scripts/rename-club.js "Indominous Club" "Indominus Club" --apply    -> makes the change
//
// The club's id does not change, so followers, FIC settings and links keep working.
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const COLLECTIONS = ["clubs", "clubEvents", "events", "eventExcusals"];

/** Replaces `from` with `to` inside strings, at any depth. Returns [newValue, changed]. */
function swap(value, from, to) {
  if (typeof value === "string") {
    return value.includes(from) ? [value.split(from).join(to), true] : [value, false];
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const [n, c] = swap(v, from, to);
      changed = changed || c;
      return n;
    });
    return [out, changed];
  }
  if (value && typeof value === "object" && value.constructor === Object) {
    let changed = false;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const [n, c] = swap(v, from, to);
      changed = changed || c;
      out[k] = n;
    }
    return [out, changed];
  }
  return [value, false];
}

async function main() {
  const [from, to] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");
  if (!from || !to || from === to) {
    console.error('Usage: node scripts/rename-club.js "Old name" "New name" [--apply]');
    process.exit(1);
  }
  // Also catch the short form, e.g. "Indominous" on its own.
  const pairs = [[from, to]];
  const shortFrom = from.replace(/\s+Club$/i, "");
  const shortTo = to.replace(/\s+Club$/i, "");
  if (shortFrom !== from && shortFrom !== shortTo) pairs.push([shortFrom, shortTo]);

  let total = 0;
  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).get();
    for (const doc of snap.docs) {
      const patch = {};
      for (const [field, value] of Object.entries(doc.data())) {
        let next = value;
        let changed = false;
        for (const [a, b] of pairs) {
          const [n, c] = swap(next, a, b);
          next = n;
          changed = changed || c;
        }
        if (changed) patch[field] = next;
      }
      const fields = Object.keys(patch);
      if (fields.length === 0) continue;
      total++;
      console.log(`${apply ? "updated" : "would update"}  ${name}/${doc.id}  (${fields.join(", ")})`);
      if (apply) await doc.ref.update(patch);
    }
  }
  console.log(total === 0 ? `\nNothing mentions "${from}".` : `\n${total} document(s) ${apply ? "updated" : "would change. Run again with --apply to change them."}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
