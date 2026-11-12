import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";

// ---- Leaderboard: prepProfiles/{uid} = { name, solved, week, weekKey } from the student's own progress ----
// Progress is self-reported (students tick what they solved), so this board is on trust.

/** Monday (IST) of the week that contains `ms`, as YYYY-MM-DD. */
export function weekKeyOf(ms: number): string {
  const ist = new Date(ms + 5.5 * 3600 * 1000);
  const day = (ist.getUTCDay() + 6) % 7; // Monday = 0
  ist.setUTCDate(ist.getUTCDate() - day);
  return ist.toISOString().slice(0, 10);
}

export const prepLeaderboard = onDocumentWritten({document: "prepProgress/{uid}", region: "asia-south1"}, async (event) => {
  const db = getFirestore();
  const uid = event.params.uid;
  const ref = db.collection("prepProfiles").doc(uid);
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  const solved = (after?.solved ?? {}) as Record<string, unknown>;
  const now = Date.now();
  const wk = weekKeyOf(now);
  let total = 0;
  let week = 0;
  for (const v of Object.values(solved)) {
    total++;
    // A timestamp from the future is not counted towards this week.
    if (typeof v === "number" && v <= now + 60000 && weekKeyOf(v) === wk) week++;
  }
  const user = await db.collection("users").doc(uid).get();
  await ref.set(
    {
      name: String(user.get("name") ?? "Student").slice(0, 80),
      batch: user.get("admissionYear") ?? null,
      branch: user.get("branch") ?? null,
      solved: total,
      week,
      weekKey: wk,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
});

// ---- CP ladder and contest calendar from the public Codeforces API ----
type CfProblem = {contestId?: number; index: string; name: string; rating?: number; tags?: string[]};
type CfStat = {contestId?: number; index: string; solvedCount: number};

async function cf<T>(path: string): Promise<T> {
  const res = await fetch(`https://codeforces.com/api/${path}`, {headers: {"User-Agent": "CollegeGoPrep/1.0"}});
  const json = (await res.json()) as {status: string; result: T; comment?: string};
  if (json.status !== "OK") throw new Error(json.comment ?? `Codeforces ${res.status}`);
  return json.result;
}

export const prepLadder = onSchedule(
  {schedule: "0 4 * * 1", timeZone: "Asia/Kolkata", region: "asia-south1", timeoutSeconds: 120, memory: "512MiB"},
  async () => {
    const db = getFirestore();
    try {
      const {problems, problemStatistics} = await cf<{problems: CfProblem[]; problemStatistics: CfStat[]}>("problemset.problems");
      const solvedBy = new Map(problemStatistics.map((s) => [`${s.contestId}${s.index}`, s.solvedCount]));
      const ratings: Record<string, unknown[]> = {};
      for (let r = 800; r <= 1900; r += 100) {
        ratings[String(r)] = problems
          .filter((p) => p.rating === r && p.contestId && p.contestId >= 1200)
          .map((p) => ({id: `${p.contestId}${p.index}`, contestId: p.contestId, index: p.index, name: p.name, tags: (p.tags ?? []).slice(0, 4), solvedBy: solvedBy.get(`${p.contestId}${p.index}`) ?? 0}))
          .sort((a, b) => b.solvedBy - a.solvedBy)
          .slice(0, 25);
      }
      await db.collection("prepLadder").doc("main").set({ratings, updatedAt: FieldValue.serverTimestamp()});
    } catch (e) {
      logger.error("Ladder refresh failed", e);
    }
    try {
      const list = await cf<{id: number; name: string; phase: string; startTimeSeconds?: number; durationSeconds: number}[]>("contest.list");
      const upcoming = list
        .filter((c) => c.phase === "BEFORE" && c.startTimeSeconds)
        .sort((a, b) => a.startTimeSeconds! - b.startTimeSeconds!)
        .slice(0, 15)
        .map((c) => ({id: c.id, name: c.name, start: c.startTimeSeconds! * 1000, minutes: Math.round(c.durationSeconds / 60)}));
      await db.collection("prepLadder").doc("contests").set({list: upcoming, updatedAt: FieldValue.serverTimestamp()});
    } catch (e) {
      logger.error("Contest refresh failed", e);
    }
  },
);
