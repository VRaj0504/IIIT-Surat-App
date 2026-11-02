import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {FieldValue, getFirestore} from "firebase-admin/firestore";

const FIELDS = ["branch", "section", "admissionYear", "specialization", "program"] as const;

export const syncRosterToUser = onDocumentWritten("roster/{regNo}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const r = after.data() as Record<string, unknown>;
  const regNo = String(event.params.regNo).toUpperCase();
  const users = await getFirestore().collection("users").where("enrollmentNumber", "==", regNo).get();
  await Promise.all(
    users.docs.map(async (d) => {
      const u = d.data() as Record<string, unknown>;
      if (u.role !== "student") return;
      const patch: Record<string, unknown> = {};
      for (const f of FIELDS) {
        const want = r[f] === undefined || r[f] === "" ? null : r[f];
        const have = u[f] === undefined ? null : u[f];
        if (want !== have) patch[f] = want === null ? FieldValue.delete() : want;
      }
      if (!Object.keys(patch).length) return;
      await d.ref.update(patch);
      // eslint-disable-next-line no-console
      console.log(`[syncRosterToUser] ${regNo}: updated ${Object.keys(patch).join(", ")}`);
    }),
  );
});
