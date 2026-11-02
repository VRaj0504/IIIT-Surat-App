import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {tokensOf} from "./audience";

export const sendCounsellingRequestPush = onDocumentCreated(
  "counsellingRequests/{requestId}",
  async (event) => {
    const data = event.data?.data() as {urgent?: boolean} | undefined;
    if (!data) return;

    const db = getFirestore();
    const counsellorsSnap = await db.collection("counsellors").get();
    if (counsellorsSnap.empty) return;

    const tokens: string[] = [];
    await Promise.all(
      counsellorsSnap.docs.map(async (counsellorDoc) => {
        const email = counsellorDoc.id;
        const userSnap = await db.collection("users").where("email", "==", email).limit(1).get();
        tokens.push(...tokensOf(userSnap.docs[0]?.data()));
      }),
    );

    await sendExpoPush(
      tokens,
      data.urgent ? "Urgent counselling request" : "New counselling request",
      data.urgent ?
        "A student has asked to talk to someone urgently — please check the app." :
        "A student has requested to talk to someone — check the app when you can.",
      "sendCounsellingRequestPush",
      {screen: "CounsellingQueue"},
    );
  },
);
