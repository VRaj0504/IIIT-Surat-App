

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
