const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("../serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const REGISTER = [["UI24EC01", "AADITYA SINGH"], ["UI24EC02", "AAKASHSINGH RAMPRAKASH PAWAR"], ["UI24EC03", "AASHI RAJPUT"], ["UI24EC04", "ABHISHEK KUMAR"], ["UI24EC05", "AESHA ASHOK SHARMA"], ["UI24EC06", "AKSHITA SHUKLA"], ["UI24EC07", "AMBALIYA TEJAS ANILBHAI"], ["UI24EC08", "AMLAN MISHRA"], ["UI24EC09", "AMRESH KUMAR"], ["UI24EC11", "ANUJ PATEL"], ["UI24EC12", "ARUN KUMAR"], ["UI24EC13", "BHAVESH KHANDELWAL"], ["UI24EC14", "BHINGARADIYA YAGNIK DIPAKBHAI"], ["UI24EC15", "BHUKYA VIDYA SRI"], ["UI24EC16", "CHAUDHARI RUDRA DHARMESHBHAI"], ["UI24EC17", "CHAUHAN MAITREYA MUKESHBHAI"], ["UI24EC18", "CHOVATIYA RUTVIJKUMAR ATULBHAI"], ["UI24EC23", "DALAL MAHIR KAUSHAL"], ["UI24EC24", "DEEPANK SAGAR"], ["UI24EC25", "DHANASHRI SANJAY JADHAV"], ["UI24EC26", "DHRUVRAJ SINGH"], ["UI24EC27", "DIVYANSHU MEENA"], ["UI24EC28", "DIYORA LAKSH VIJAYBHAI"], ["UI24EC29", "DUDHAT JAIMIN BHARATKUMAR"], ["UI24EC30", "GALA PURVA KALPESH"], ["UI24EC31", "GUNDRATHI SATHWIK GOUD"], ["UI24EC32", "HAPALIYA UDAY ASHOKBHAI"], ["UI24EC33", "HAPANI JEELS NARANBHAI"], ["UI24EC34", "HARSHKUMAR CHAUHAN"], ["UI24EC35", "HEMANSHU AJAY NEMADE"], ["UI24EC36", "JADAV SHANKAR NAYAK"], ["UI24EC37", "JARIWALA MOHAMMED UZAIR MOHAMMED ZUBER"], ["UI24EC38", "JITESH SINGH"], ["UI24EC39", "JUHI AHUJA"], ["UI24EC40", "JYOTI SINGH"], ["UI24EC41", "KACHARIYA KEYUR SURESHBHAI"], ["UI24EC42", "KAJAVADRA OM SHAMBHUBHAI"], ["UI24EC43", "KARDILE RUSHIKESH BHAGCHAND"], ["UI24EC44", "KHUSHAL DHANARAM CHOUDHARY"], ["UI24EC45", "KORRA VAMSHI KUMAR"], ["UI24EC46", "LAKHTARIYA RUDRA ASHISH"], ["UI24EC47", "MAINAM SAHASRA"], ["UI24EC48", "MALLIPUDI VENKAT SUBASH"], ["UI24EC49", "MANAS KAPIL SHARMA"], ["UI24EC50", "MARATHE VAIBHAV ASHOK"], ["UI24EC51", "MUPPALA VENKATA PRAJYESH"], ["UI24EC52", "NIKHIL PANDEY"], ["UI24EC53", "NITYAM DAVE"], ["UI24EC54", "PANDAV RAJ RAMESHBHAI"], ["UI24EC55", "PANDYA RUSHABH BRIJESHBHAI"], ["UI24EC56", "PARMAR NIYOSHI PRAKASHBHAI"], ["UI24EC57", "PARTH ACHARYA"], ["UI24EC58", "PARTH GUPTA"], ["UI24EC59", "PATEL FALAK JAYESHBHAI"], ["UI24EC61", "PATEL RAJ PARESHKUMAR"], ["UI24EC62", "PATEL SHRIMAL MAYURKUMAR"], ["UI24EC63", "PAVAN MEENA"], ["UI24EC64", "PAWAR VIPUL RAYSINGH"], ["UI24EC65", "PIYUSH RAJ"], ["UI24EC66", "PRANAV SOLANKI"], ["UI24EC67", "RACHIT SINGH"], ["UI24EC68", "RAMAN GUPTA"], ["UI24EC69", "RISHIKA CHANTHATI"], ["UI23EC18", "SATASIYA ANSH DINESHBHAI"], ["UI23EC65", "SAURABH"]];

const words = (s) => String(s || "").toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
const same = (a, b) => {
  const A = new Set(words(a));
  return words(b).some((w) => A.has(w));
};

async function main() {
  let ok = 0;
  const wrong = [];
  const missing = [];
  for (const [reg, name] of REGISTER) {
    const d = await db.collection("roster").doc(reg).get();
    if (!d.exists) { missing.push(`${reg}  ${name}`); continue; }
    const r = d.data();
    if (same(name, r.name)) ok++;
    else wrong.push(`${reg}  register: ${name}  |  portal roster: ${r.name} (${r.branch} ${r.admissionYear}${r.section ? " " + r.section : ""})`);
  }
  console.log(`Register students: ${REGISTER.length}`);
  console.log(`Name matches the portal roster: ${ok}`);
  console.log(`Different person under the same number: ${wrong.length}`);
  wrong.forEach((w) => console.log("  " + w));
  console.log(`Not in the portal roster: ${missing.length}`);
  missing.forEach((m) => console.log("  " + m));

  const regs = new Set(REGISTER.map((x) => x[0]));
  const extra = await db.collection("roster").where("branch", "==", "ECE").where("admissionYear", "==", 2024).get();
  const notInRegister = extra.docs.filter((d) => !regs.has(d.id));
  console.log(`In the portal's 2024 ECE roster but not on this register: ${notInRegister.length}`);
  notInRegister.forEach((d) => console.log(`  ${d.id}  ${d.data().name}`));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
