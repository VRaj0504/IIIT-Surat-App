import { getFirestore, initializeFirestore, memoryLocalCache, memoryLruGarbageCollector } from 'firebase/firestore';
import { firebaseApp } from './config';

function createDb() {
  try {
    return initializeFirestore(firebaseApp, {
      localCache: memoryLocalCache({ garbageCollector: memoryLruGarbageCollector({ cacheSizeBytes: 40 * 1024 * 1024 }) }),
    });
  } catch {

    return getFirestore(firebaseApp);
  }
}

export const db = createDb();
