

const { initializeApp } = require("firebase-admin/app");
const { cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
const auth = getAuth();

async function listAllAuthUsers() {
  const users = [];
  let nextPageToken;
  do {
    const result = await auth.listUsers(1000, nextPageToken);
    users.push(...result.users);
    nextPageToken = result.pageToken;
  } while (nextPageToken);
  return users;
}

async function main() {
  console.log("Fetching all Auth accounts...");
  const authUsers = await listAllAuthUsers();
  console.log(`Found ${authUsers.length} Auth accounts.`);

  let fixed = 0;
  let skipped = 0;

  for (const authUser of authUsers) {
    const email = (authUser.email || "").toLowerCase();
    if (!email) {
      skipped++;
      continue;
    }

    const allowSnap = await db.collection("allowlist").doc(email).get();
    if (!allowSnap.exists) {
      skipped++;
      continue;
    }
    const allowData = allowSnap.data();
    if (allowData.role !== "faculty") {
      skipped++;
      continue;
    }

    const patch = {
      name: allowData.name,
      email,
      role: "faculty",
      ...(allowData.department ? { department: allowData.department } : {}),
      ...(allowData.designation ? { designation: allowData.designation } : {}),
      ...(allowData.roleEmail ? { roleEmail: allowData.roleEmail } : {}),
      ...(allowData.shortForm ? { shortForm: allowData.shortForm } : {}),
      ...(allowData.additionalDepartments ? { additionalDepartments: allowData.additionalDepartments } : {}),
      ...(allowData.tnpInCharge ? { tnpInCharge: allowData.tnpInCharge } : {}),
    };

    await db.collection("users").doc(authUser.uid).set(patch, { merge: true });
    console.log(`Fixed: ${email} (${authUser.uid})`);
    fixed++;
  }

  console.log(`\nDone. Fixed ${fixed} faculty profiles, skipped ${skipped} (students/non-faculty/no-email accounts).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  });
