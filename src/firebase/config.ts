import { initializeApp, getApps, getApp } from 'firebase/app';

// Client-side Firebase config — pulled from env vars so it isn't committed to
// source. This key should also be *restricted* in the Google Cloud Console
// (API restrictions) — that's what actually limits what it can be used for,
// not keeping it out of git.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Guard against re-initializing on hot reload during development.
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);