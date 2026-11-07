import {getFirestore} from "firebase-admin/firestore";

export type PrefKey =
  | "announcements"
  | "notices"
  | "resources"
  | "timetableUpdates"
  | "clubEvents"
  | "examsAndGrades"
  | "attendanceAlerts"
  | "classReminders";

export type UserDoc = {
  role?: string;
  name?: string;
  branch?: string;
  section?: string | null;
  admissionYear?: number;
  specialization?: string | null;
  program?: "UG" | "PG";
  enrollmentNumber?: string;
  reviewer?: boolean;
  expoPushToken?: string;
  expoPushTokens?: string[];
  notificationPreferences?: Partial<Record<PrefKey, boolean>> & {classReminderMinutes?: number};
};

export function tokensOf(u: UserDoc | undefined | null): string[] {
  if (!u) return [];
  const out = new Set<string>();
  if (typeof u.expoPushToken === "string" && u.expoPushToken) out.add(u.expoPushToken);
  if (Array.isArray(u.expoPushTokens)) for (const t of u.expoPushTokens) if (typeof t === "string" && t) out.add(t);
  return Array.from(out);
}

const squash = (s: unknown) => String(s ?? "").toUpperCase().replace(/[\s_\-.]+/g, "");

export function normSection(branch: unknown, section: unknown): string {
  const b = squash(branch);
  let x = squash(section).replace(/^(SECTION|SEC)/, "");
  if (b && x.startsWith(b)) x = x.slice(b.length);
  return x;
}

export const sameSection = (branch: unknown, a: unknown, b: unknown) => normSection(branch, a) === normSection(branch, b);
export const sameBranch = (a: unknown, b: unknown) => squash(a) === squash(b);

export function currentSemester(admissionYear: number, program: "UG" | "PG" = "UG", now: Date = new Date()): number {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const month = ist.getUTCMonth() + 1;
  const year = ist.getUTCFullYear();
  const isOdd = month >= 7;
  const idx = isOdd ? year - admissionYear : year - admissionYear - 1;
  const sem = idx * 2 + 1 + (isOdd ? 0 : 1);
  return Math.min(Math.max(sem, 1), program === "PG" ? 4 : 8);
}

export type Target = {
  branches?: string[];
  sections?: string[];
  admissionYears?: number[];
  specialization?: string | null;
  semester?: number | null;
  pref?: PrefKey;
};

export type Recipient = {uid: string; user: UserDoc; tokens: string[]};

export async function studentsFor(t: Target): Promise<{matched: Recipient[]; total: number}> {
  const snap = await getFirestore().collection("users").where("role", "==", "student").get();
  const branches = (t.branches ?? []).filter(Boolean);
  const sections = (t.sections ?? []).filter(Boolean);
  const years = (t.admissionYears ?? []).filter((y) => typeof y === "number" && y > 0);
  const matched: Recipient[] = [];
  snap.docs.forEach((d) => {
    const u = d.data() as UserDoc;
    if (u.reviewer === true) return;
    if (branches.length && !branches.some((b) => sameBranch(b, u.branch))) return;
    if (sections.length && !sections.some((s) => sameSection(u.branch, s, u.section))) return;
    if (years.length && !years.includes(Number(u.admissionYear))) return;
    if (t.specialization && squash(t.specialization) !== squash(u.specialization)) return;
    if (t.semester && (!u.admissionYear || currentSemester(Number(u.admissionYear), u.program) !== Number(t.semester))) return;
    matched.push({uid: d.id, user: u, tokens: tokensOf(u)});
  });
  return {matched, total: snap.size};
}

export function wants(u: UserDoc, pref?: PrefKey): boolean {
  return !pref || u.notificationPreferences?.[pref] !== false;
}

export function tokensFor(list: Recipient[], pref?: PrefKey): string[] {
  const out = new Set<string>();
  for (const r of list) if (wants(r.user, pref)) for (const tk of r.tokens) out.add(tk);
  return Array.from(out);
}

export async function userTokens(uid: string | null | undefined, pref?: PrefKey): Promise<string[]> {
  if (!uid) return [];
  const u = (await getFirestore().collection("users").doc(uid).get()).data() as UserDoc | undefined;
  if (!u || !wants(u, pref)) return [];
  return tokensOf(u);
}

export async function tokensByEnrollment(regNo: string, pref?: PrefKey): Promise<string[]> {
  if (!regNo) return [];
  const snap = await getFirestore().collection("users").where("enrollmentNumber", "==", regNo.toUpperCase()).get();
  const out = new Set<string>();
  snap.docs.forEach((d) => {
    const u = d.data() as UserDoc;
    if (wants(u, pref)) tokensOf(u).forEach((tk) => out.add(tk));
  });
  return Array.from(out);
}
