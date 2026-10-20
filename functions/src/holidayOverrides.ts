// Ad-hoc holidays — the kind IIIT Surat announces by email a day or
// two ahead (Ganesh Visarjan, an unplanned closure, etc.), which never
// appear on the fixed annual calendar in holidays.ts. Those emails go
// straight to everyone's personal inbox, not this app's own uploads
// address, so there's no reliable way to detect one automatically —
// see AddHoliday.tsx in the faculty web portal, where a real person
// who's read the actual circular types it in directly. This just
// reads what they entered.
//
// One doc per date, id == "YYYY-MM-DD", in the `holidayOverrides`
// collection: { name: string, addedBy, addedByName, addedAt }.

// Same 5-minute in-memory cache pattern as loadExamDocs in
// examPeriod.ts — this is read every single time sendClassReminderPush
// runs (every minute, during class hours), so a plain per-run
// Firestore read would be wasteful for a collection that changes rarely.
let cache: {at: number; overrides: Map<string, string>} | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function loadHolidayOverrides(db: FirebaseFirestore.Firestore): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.overrides;
  const snap = await db.collection("holidayOverrides").get();
  const overrides = new Map<string, string>();
  snap.docs.forEach((d) => {
    const name = d.data()?.name;
    if (typeof name === "string" && name.trim()) overrides.set(d.id, name.trim());
  });
  cache = {at: Date.now(), overrides};
  return overrides;
}
