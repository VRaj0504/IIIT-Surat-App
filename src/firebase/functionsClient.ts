import { getFunctions } from 'firebase/functions';
import { firebaseApp } from './config';

// Pinned to the same region placeOrderFn/razorpayWebhook/dailyReconcile
// deploy to (see functions/src/placeOrder.ts) — calling a different region
// would still work but adds an unnecessary cross-region hop to every order.
export const functions = getFunctions(firebaseApp, 'asia-south1');
