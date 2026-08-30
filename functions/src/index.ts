import * as admin from "firebase-admin";
admin.initializeApp();

export {placeOrderFn} from "./placeOrder";
// razorpayWebhook is deliberately NOT exported yet — it references
// RAZORPAY_WEBHOOK_SECRET via defineSecret(), and merely having it
// exported here forces every deploy (even of an unrelated function) to
// check Secret Manager for that secret's existence, which fails outright
// if the Secret Manager API isn't enabled yet or the secret was never
// set. Re-add this export once Razorpay is actually being wired up for
// real — the function itself (razorpayWebhook.ts) is untouched and ready
// to go the moment this line comes back.
// export {razorpayWebhook} from "./razorpayWebhook";
export {dailyReconcile} from "./reconcile";
export {sendAnnouncementPush} from "./sendAnnouncementPush";
export {sendLostFoundContactPush} from "./sendLostFoundContactPush";
export {extractPosterInfo} from "./extractPosterInfo";