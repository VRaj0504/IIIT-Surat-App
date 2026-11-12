import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {FieldValue, getFirestore} from "firebase-admin/firestore";

// Company Prep website: keeps each company's counters (questions, topics, difficulty, rounds) and the
// contributor leaderboard in step with prepQuestions. Also decides which campus summaries are free:
// the first FREE_PER_COMPANY campus questions of each company stay readable without Plus.
const FREE_PER_COMPANY = 3;

type Q = {
  companySlug?: string;
  topics?: string[];
  difficulty?: string;
  round?: string;
  source?: string;
  contributorUid?: string;
  contributorName?: string;
  createdAt?: FirebaseFirestore.Timestamp;
};

async function recountCompany(slug: string) {
  const db = getFirestore();
  const snap = await db.collection("prepQuestions").where("companySlug", "==", slug).get();
  const topics: Record<string, number> = {};
  const difficulty: Record<string, number> = {Easy: 0, Medium: 0, Hard: 0};
  const rounds: Record<string, number> = {};
  let campus = 0;
  let last = 0;
  const campusDocs: {id: string; at: number}[] = [];
  snap.docs.forEach((d) => {
    const q = d.data() as Q;
    (q.topics ?? []).forEach((t) => (topics[t] = (topics[t] ?? 0) + 1));
    if (q.difficulty) difficulty[q.difficulty] = (difficulty[q.difficulty] ?? 0) + 1;
    if (q.round) rounds[q.round] = (rounds[q.round] ?? 0) + 1;
    const at = q.createdAt?.toMillis?.() ?? 0;
    last = Math.max(last, at);
    if (q.source === "campus") {
      campus++;
      campusDocs.push({id: d.id, at});
    }
  });
  const ref = db.collection("prepCompanies").doc(slug);
  if ((await ref.get()).exists) {
    await ref.update({
      questionCount: snap.size,
      campusCount: campus,
      topicCounts: topics,
      difficultyCounts: difficulty,
      roundCounts: rounds,
      lastAddedAt: last ? new Date(last) : null,
    });
  }
  // Oldest campus questions are the free preview.
  campusDocs.sort((a, b) => a.at - b.at);
  const batch = db.batch();
  campusDocs.forEach((c, i) =>
    batch.set(db.collection("prepQuestionDetails").doc(c.id), {free: i < FREE_PER_COMPANY}, {merge: true}),
  );
  if (campusDocs.length) await batch.commit();
}

async function recountContributor(uid: string, name?: string) {
  const db = getFirestore();
  const n = (await db.collection("prepQuestions").where("contributorUid", "==", uid).count().get()).data().count;
  const ref = db.collection("prepContributors").doc(uid);
  if (n === 0) await ref.delete();
  else await ref.set({approved: n, ...(name ? {name} : {}), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
}

export const prepCounts = onDocumentWritten({document: "prepQuestions/{qid}", region: "asia-south1"}, async (event) => {
  const before = event.data?.before?.exists ? (event.data.before.data() as Q) : null;
  const after = event.data?.after?.exists ? (event.data.after.data() as Q) : null;
  if (!after) await getFirestore().collection("prepQuestionDetails").doc(event.params.qid).delete();

  const companies = new Set([before?.companySlug, after?.companySlug].filter(Boolean) as string[]);
  for (const slug of companies) await recountCompany(slug);

  const people = new Map<string, string | undefined>();
  if (before?.contributorUid) people.set(before.contributorUid, before.contributorName);
  if (after?.contributorUid) people.set(after.contributorUid, after.contributorName);
  for (const [uid, name] of people) await recountContributor(uid, name);
});
