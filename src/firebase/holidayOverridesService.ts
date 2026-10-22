import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firestore";
import { persisted } from './liveCache';

export function subscribeToHolidayOverrides(
  onUpdate: (overrides: Record<string, string>) => void,
): () => void {
  return persisted("holidays", (onUpdate) => onSnapshot(
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
  ), onUpdate);
}
