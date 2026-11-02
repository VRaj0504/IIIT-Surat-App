import {getFirestore} from "firebase-admin/firestore";

export async function isLeaderUid(uid: string | undefined | null): Promise<{ok: boolean; email: string}> {
  if (!uid) return {ok: false, email: ""};
  const db = getFirestore();
  const [me, cfg] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("config").doc("leadership").get(),
  ]);
  const u = me.data() as {email?: string; role?: string; isAdmin?: boolean} | undefined;
  const email = String(u?.email ?? "").toLowerCase();
  if (!u) return {ok: false, email};
  if (u.role === "admin" || u.isAdmin === true) return {ok: true, email};
  const emails = ((cfg.data()?.emails ?? []) as string[]).map((e) => String(e).toLowerCase());
  return {ok: !!email && emails.includes(email), email};
}
