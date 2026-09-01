import * as admin from "firebase-admin";
admin.initializeApp();

export {placeOrderFn} from "./placeOrder";
// razorpayWebhook now exported — RAZORPAY_WEBHOOK_SECRET exists as a
// secret (a placeholder value initially, then updated to the real one
// once the webhook is actually created on Razorpay's dashboard, which
// needs this function's URL first — see the deploy sequence in chat).
export {razorpayWebhook} from "./razorpayWebhook";
export {dailyReconcile} from "./reconcile";
export {sendAnnouncementPush} from "./sendAnnouncementPush";
export {sendLostFoundContactPush} from "./sendLostFoundContactPush";
export {extractPosterInfo} from "./extractPosterInfo";
export {extractTimetableInfo} from "./extractTimetableInfo";
export {createRechargeOrder} from "./createRechargeOrder";
