import { getFirestore, initializeFirestore, memoryLocalCache, memoryLruGarbageCollector } from 'firebase/firestore';
import { firebaseApp } from './config';

// Keep recently loaded documents in memory (up to ~40 MB) instead of
// throwing them away as soon as a screen closes, so going back to a screen
// shows its data instantly while it re-syncs in the background.
function createDb() {
  try {
    return initializeFirestore(firebaseApp, {
      localCache: memoryLocalCache({ garbageCollector: memoryLruGarbageCollector({ cacheSizeBytes: 40 * 1024 * 1024 }) }),
    });
  } catch {
    // Already initialised (hot reload in development).
    return getFirestore(firebaseApp);
  }
}

export const db = createDb();
