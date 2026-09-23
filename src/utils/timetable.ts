import type { TimetableSlot } from "../firebase/timetableService";


export function mergeContiguousSlots<T extends TimetableSlot & { branch?: string; section?: string }>(
  slots: T[],
): T[] {
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const merged: T[] = [];
  const openByKey = new Map<string, T>();

  const keyOf = (s: T) =>
    [s.subjectCode, s.room, s.group ?? "", s.branch ?? "", s.section ?? ""].join("|");

  for (const slot of sorted) {
    const key = keyOf(slot);
    const open = openByKey.get(key);
    if (open && open.endTime === slot.startTime) {
      open.endTime = slot.endTime; // extend the existing card for this track
    } else {
      const copy = { ...slot };
      merged.push(copy);
      openByKey.set(key, copy);
    }
  }

  return merged;
}


export function countClassPeriods<T extends TimetableSlot & { branch?: string; section?: string }>(
  slots: T[],
): number {
  const merged = mergeContiguousSlots(slots);
  const uniquePeriods = new Set(merged.map((s) => `${s.startTime}|${s.endTime}`));
  return uniquePeriods.size;
}