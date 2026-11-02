import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getAuth} from "firebase-admin/auth";

export const syncRoleClaim = onDocumentWritten(
  "users/{uid}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) {
      if (event.data?.before?.exists) {
        await getAuth().setCustomUserClaims(event.params.uid, null).catch(() => undefined);
        await getAuth().revokeRefreshTokens(event.params.uid).catch(() => undefined);
      }
      return;
    }

    const beforeRole = event.data?.before?.exists ? (event.data.before.data()?.role as string | undefined) : undefined;
    const afterRole = after.data()?.role as string | undefined;
    if (afterRole === beforeRole) return;

    await getAuth().setCustomUserClaims(event.params.uid, afterRole ? {role: afterRole} : null);
    if (beforeRole) await getAuth().revokeRefreshTokens(event.params.uid).catch(() => undefined);
  },
);
