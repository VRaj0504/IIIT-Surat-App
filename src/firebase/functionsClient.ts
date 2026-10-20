import { getFunctions } from 'firebase/functions';
import { firebaseApp } from './config';

// Pinned to the same region every callable in this app deploys to —
// calling a different region would still work but adds an unnecessary
// cross-region hop to every call.
export const functions = getFunctions(firebaseApp, 'asia-south1');
