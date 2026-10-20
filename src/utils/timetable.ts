import type { TimetableSlot } from "../firebase/timetableService";

// Times are compared as minutes since midnight (text order puts "9:00"
// after "10:00"). The parser is the shared tolerant one from
// roomAvailability.ts — it also understands "09:00", "9:00 AM" and
// "2:00" meaning 2 PM, which a strict "H:MM" check silently dropped.
import { toMinutes } from "./roomAvailability";
export { toMinutes };

export function mergeContiguousSlots<T extends TimetableSlot & { branch?: string; section?: string }>(
  slots: T[],
): T[] {
  const sorted = [...slots].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  const merged: T[] = [];
  const openByKey = new Map<string, T>();

  const keyOf = (s: T) =>
    [s.subjectCode, s.room, s.group ?? "", s.branch ?? "", s.section ?? ""].join("|");

  for (const slot of sorted) {
    const key = keyOf(slot);
    const open = openByKey.get(key);
    if (open && toMinutes(open.endTime) === toMinutes(slot.startTime)) {
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