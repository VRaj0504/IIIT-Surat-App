// Company Prep website admin tasks.
//   node scripts/prep-admin.js seed-companies          add the starter list of recruiters (skips ones that exist)
//   node scripts/prep-admin.js reviewer grant <email>  let a TnP coordinator approve questions
//   node scripts/prep-admin.js reviewer revoke <email>
//   node scripts/prep-admin.js reviewer list
//   node scripts/prep-admin.js gate on|off             on = campus summaries beyond the free 3 need Plus
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
initializeApp({ credential: cert(require("./serviceAccountKey.json")) });
const db = getFirestore();

const P = "Product / Big-Tech", F = "Fintech / Quant", S = "IT Services", ST = "Startup", C = "Consulting / Analytics", H = "Core / Hardware";
const COMPANIES = [
  ["Adobe", P], ["Amazon", P], ["Apple", P], ["Atlassian", P], ["Cisco", P], ["Flipkart", P], ["Google", P],
  ["Intuit", P], ["LinkedIn", P], ["Microsoft", P], ["Oracle", P], ["Salesforce", P], ["SAP Labs", P],
  ["ServiceNow", P], ["Uber", P], ["Walmart Global Tech", P], ["Arista Networks", P], ["Juniper Networks", P],
  ["Media.net", P], ["Nutanix", P], ["VMware", P], ["Zoho", P],
  ["American Express", F], ["Barclays", F], ["BlackRock", F], ["D. E. Shaw", F], ["Goldman Sachs", F],
  ["JPMorgan Chase", F], ["Mastercard", F], ["Morgan Stanley", F], ["PayPal", F], ["Visa", F], ["Tower Research", F],
  ["Graviton Research", F], ["Optiver", F], ["Quadeye", F], ["Razorpay", F], ["PhonePe", F], ["Paytm", F],
  ["Accenture", S], ["Capgemini", S], ["Cognizant", S], ["HCLTech", S], ["Infosys", S], ["LTIMindtree", S],
  ["TCS", S], ["Tech Mahindra", S], ["Wipro", S],
  ["Swiggy", ST], ["Zomato", ST], ["CRED", ST], ["Meesho", ST], ["Groww", ST], ["Zepto", ST], ["Ola", ST],
  ["Deloitte", C], ["EY", C], ["KPMG", C], ["PwC", C], ["ZS Associates", C], ["Mu Sigma", C],
  ["AMD", H], ["Intel", H], ["NVIDIA", H], ["Qualcomm", H], ["Samsung R&D", H], ["Texas Instruments", H],
];
const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "seed-companies") {
    let added = 0;
    for (const [name, category] of COMPANIES) {
      const ref = db.collection("prepCompanies").doc(slug(name));
      if ((await ref.get()).exists) continue;
      await ref.set({ name, category, questionCount: 0, campusCount: 0, topicCounts: {}, difficultyCounts: {}, roundCounts: {}, createdAt: FieldValue.serverTimestamp() });
      added++;
    }
    console.log(`Added ${added} companies (${COMPANIES.length - added} already there).`);
  } else if (cmd === "reviewer" && (a === "grant" || a === "revoke") && b) {
    const user = await getAuth().getUserByEmail(b.trim().toLowerCase());
    const ref = db.collection("prepReviewers").doc(user.uid);
    if (a === "grant") await ref.set({ email: user.email, grantedAt: FieldValue.serverTimestamp() });
    else await ref.delete();
    console.log(`${a === "grant" ? "Granted" : "Removed"} reviewer: ${user.email}`);
  } else if (cmd === "reviewer" && a === "list") {
    const snap = await db.collection("prepReviewers").get();
    snap.docs.forEach((d) => console.log(" ", d.get("email")));
    if (snap.empty) console.log("  no reviewers (admins can always review)");
  } else if (cmd === "gate" && (a === "on" || a === "off")) {
    await db.collection("config").doc("prep").set({ plusGate: a === "on" }, { merge: true });
    console.log(`Plus gate for campus questions: ${a}`);
  } else {
    console.log("Usage: see the top of scripts/prep-admin.js");
    process.exit(1);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message || e); process.exit(1); });
