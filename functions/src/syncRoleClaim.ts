import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

// Keeps each account's Firebase Auth custom claim `role` in step with
// its `users/{uid}` Firestore doc, going forward. This is what lets
// firestore.rules check `request.auth.token.role` (free — it's already
// on the request) instead of paying for a get() on every single
// operation that calls isAdmin()/isFaculty() (73 call sites at last
// count) — a real, per-operation cost that only grows with the user
// base.
//
// Only fires an Admin SDK call when `role` actually changed (including
// the doc's very first write), not on every unrelated profile edit
// (name, section, expoPushToken, ...) — those happen far more often
// than a role ever does, and each setCustomUserClaims call is its own
// billed Admin SDK operation.
//
// A brand-new account created by signUp() (see AuthContext.tsx) gets
// its claim set within moments of signup this way. Accounts that
// existed before this function was deployed need the one-time
// backfillRoleClaims callable (see that file) to get their first claim
// — this trigger alone only fires on a WRITE, not retroactively.
export const syncRoleClaim = onDocumentWritten(
  "users/{uid}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return; // deleted profile — nothing to sync

    const beforeRole = event.data?.before?.exists ? (event.data.before.data()?.role as string | undefined) : undefined;
    const afterRole = after.data()?.role as string | undefined;
    if (!afterRole || afterRole === beforeRole) return;

    await admin.auth().setCustomUserClaims(event.params.uid, {role: afterRole});
  },
);
