import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firestore";

// Ad-hoc holidays a real faculty/admin adds after reading an actual
// email circular — e.g. Ganesh Visarjan, an unplanned closure — which
// never appear in the fixed annual list in src/utils/dayStatus.ts.
// Written from AddHoliday.tsx in the faculty web portal; this just
// reads it. One doc per date, id == "YYYY-MM-DD", { name: string }.
export function subscribeToHolidayOverrides(
  onUpdate: (overrides: Record<string, string>) => void,
): () => void {
  return onSnapshot(
    collection(db, "holidayOverrides"),
    (snapshot) => {
      const overrides: Record<string, string> = {};
      snapshot.docs.forEach((d) => {
        const name = d.data()?.name;
        if (typeof name === "string" && name.trim()) overrides[d.id] = name.trim();
      });
      onUpdate(overrides);
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[holidayOverridesService] subscribeToHolidayOverrides error:", err);
      onUpdate({});
    },
  );
}
