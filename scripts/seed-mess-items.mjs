import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

// Same public client config as src/firebase/config.ts
const firebaseConfig = {
  apiKey: 'AIzaSyCF5YItLRNrDtNnO6MgHeLweyzeKwT7ov8',
  authDomain: 'iiit-surat-app-6643d.firebaseapp.com',
  projectId: 'iiit-surat-app-6643d',
  storageBucket: 'iiit-surat-app-6643d.firebasestorage.app',
  messagingSenderId: '568691830636',
  appId: '1:568691830636:web:4be7fd34f4098d1d994d49',
};

// Edit prices/items to match your actual mess counter before running.
const ITEMS = [
  { name: 'Veg Thali', category: 'Thali', price: 60 },
  { name: 'Special Thali', category: 'Thali', price: 90 },
  { name: 'Egg Thali', category: 'Thali', price: 75 },
  { name: 'Samosa', category: 'Snacks', price: 15 },
  { name: 'Bread Pakora', category: 'Snacks', price: 20 },
  { name: 'Maggi', category: 'Snacks', price: 30 },
  { name: 'Sandwich', category: 'Snacks', price: 35 },
  { name: 'Tea', category: 'Beverages', price: 10 },
  { name: 'Coffee', category: 'Beverages', price: 15 },
  { name: 'Cold Drink', category: 'Beverages', price: 20 },
  { name: 'Lassi', category: 'Beverages', price: 25 },
];

async function main() {
  const email = process.env.FACULTY_EMAIL;
  const password = process.env.FACULTY_PASSWORD;
  if (!email || !password) {
    console.error('Set FACULTY_EMAIL and FACULTY_PASSWORD environment variables before running.');
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log(`Signing in as ${email}...`);
  await signInWithEmailAndPassword(auth, email, password);
  console.log('Signed in. Creating mess menu items...\n');

  let created = 0;
  let skipped = 0;

  for (const item of ITEMS) {
    const existingQuery = query(collection(db, 'messMenuItems'), where('name', '==', item.name));
    const existing = await getDocs(existingQuery);
    if (!existing.empty) {
      console.log(`skip   ${item.name} (already exists)`);
      skipped++;
      continue;
    }

    await addDoc(collection(db, 'messMenuItems'), {
      name: item.name,
      category: item.category,
      price: item.price,
      available: true,
      createdAt: serverTimestamp(),
    });
    console.log(`created ${item.name} (${item.category}, ₹${item.price})`);
    created++;
  }

  console.log(`\nDone. Created ${created}, skipped ${skipped} (already existed).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
