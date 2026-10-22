import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

export const syncRoleClaim = onDocumentWritten(
  "users/{uid}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const beforeRole = event.data?.before?.exists ? (event.data.before.data()?.role as string | undefined) : undefined;
    const afterRole = after.data()?.role as string | undefined;
    if (!afterRole || afterRole === beforeRole) return;

    await admin.auth().setCustomUserClaims(event.params.uid, {role: afterRole});
  },
);
