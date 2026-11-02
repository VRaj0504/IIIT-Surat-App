import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {isLeaderUid} from "./leadership";

const DAY = 86400000;
const CATEGORIES = ["Facilities", "Harassment", "Academic", "Coursework", "Exam", "Other"];

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

let cache: {at: number; data: unknown} | null = null;

export const getDirectorOverview = onCall({region: "asia-south1", memory: "256MiB", timeoutSeconds: 60}, async (req) => {
  const {ok} = await isLeaderUid(req.auth?.uid);
  if (!ok) throw new HttpsError("permission-denied", "Only the Director's office can open this page.");
  if (cache && Date.now() - cache.at < 2 * 60 * 1000 && req.data?.force !== true) return cache.data;

  const db = getFirestore();
  const now = Date.now();
  const since = Timestamp.fromMillis(now - 90 * DAY);

  const [complaintSnap, sosSnap] = await Promise.all([
    db.collection("complaints").where("createdAt", ">=", since).get(),
    db.collection("sosAlerts").where("createdAt", ">=", since).get(),
  ]);

  const complaints = complaintSnap.docs
    .map((d) => ({id: d.id, ...d.data()} as Record<string, any>))
    .filter((c) => (c.type ?? "complaint") === "complaint");
  const within = (days: number) => complaints.filter((c) => c.createdAt && now - c.createdAt.toMillis() <= days * DAY);
  const last30 = within(30);
  const open = complaints.filter((c) => c.status === "pending");
  const daysToResolve = (c: Record<string, any>) => (c.resolvedAt.toMillis() - c.createdAt.toMillis()) / DAY;
  const resolvedTimed = complaints.filter((c) => c.status === "resolved" && c.resolvedAt && c.createdAt);

  const byCategory = CATEGORIES.map((category) => {
    const list = complaints.filter((c) => (c.category ?? "Other") === category);
    return {
      category,
      total: list.length,
      open: list.filter((c) => c.status === "pending").length,
      resolved: list.filter((c) => c.status === "resolved").length,
      rejected: list.filter((c) => c.status === "rejected").length,
    };
  }).filter((c) => c.total > 0);

  const sos = sosSnap.docs.map((d) => ({id: d.id, ...d.data()} as Record<string, any>)).filter((a) => a.status !== "cancelled");
  const sosLast30 = sos.filter((a) => a.createdAt && now - a.createdAt.toMillis() <= 30 * DAY);
  const responseMins = sosLast30
    .filter((a) => a.ackBy?.at && a.createdAt)
    .map((a) => Math.max(0, (a.ackBy.at - a.createdAt.toMillis()) / 60000));
  const typeLabel: Record<string, string> = {medical: "Medical", safety: "Safety", other: "Emergency"};

  const data = {
    generatedAt: now,
    complaints: {
      open: open.length,
      openOver7Days: open.filter((c) => c.createdAt && now - c.createdAt.toMillis() > 7 * DAY).length,
      filedLast30: last30.length,
      resolvedLast30: last30.filter((c) => c.status === "resolved").length,
      rejectedLast30: last30.filter((c) => c.status === "rejected").length,
      avgDaysToResolve: avg(resolvedTimed.map(daysToResolve)),
      resolvedWithin3Days: resolvedTimed.length ? Math.round((resolvedTimed.filter((c) => daysToResolve(c) <= 3).length / resolvedTimed.length) * 100) : null,
      byCategory,
      oldestOpen: open
        .filter((c) => c.createdAt)
        .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())
        .slice(0, 8)
        .map((c) => ({
          subject: String(c.subject ?? ""),
          category: String(c.category ?? "Other"),
          addressedTo: c.facultyName ? String(c.facultyName) : "Complaints committee",
          daysOpen: Math.floor((now - c.createdAt.toMillis()) / DAY),
        })),
    },
    sos: {
      active: sos
        .filter((a) => a.status === "open" || a.status === "acknowledged")
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
        .map((a) => ({
          type: typeLabel[a.type] ?? "Emergency",
          studentName: String(a.studentName ?? ""),
          status: a.status as string,
          minutesAgo: a.createdAt ? Math.round((now - a.createdAt.toMillis()) / 60000) : 0,
          responder: a.ackBy?.name ? String(a.ackBy.name) : null,
        })),
      last30: sosLast30.length,
      resolvedLast30: sosLast30.filter((a) => a.status === "resolved").length,
      avgResponseMinutes: avg(responseMins),
      recent: sos
        .filter((a) => a.createdAt)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
        .slice(0, 6)
        .map((a) => ({
          type: typeLabel[a.type] ?? "Emergency",
          status: a.status as string,
          at: a.createdAt.toMillis() as number,
          responseMinutes: a.ackBy?.at ? Math.round(Math.max(0, (a.ackBy.at - a.createdAt.toMillis()) / 60000)) : null,
          responder: a.ackBy?.name ? String(a.ackBy.name) : null,
        })),
    },
  };
  cache = {at: now, data};
  return data;
});
