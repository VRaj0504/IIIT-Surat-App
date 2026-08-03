import type { Timetable, TimetableSlot } from "../firebase/timetableService";

// How students actually experience mess ordering: the break isn't a config
// value anyone maintains, it's just the gap between two classes on that
// section's real timetable. We look for the biggest gap that falls in a
// plausible lunch window instead of assuming "12-1" applies to everyone —
// different years/branches have their break at different times.
const LUNCH_WINDOW_START = "11:00";
const LUNCH_WINDOW_END = "15:00";
const MIN_BREAK_MINUTES = 30;

export type BreakWindow = { start: string; end: string }; // "H:MM", 24hr, matches timetable slot format

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

// Finds the lunch-break gap in one day's slots, or null if there isn't one
// (e.g. a day with back-to-back classes, or fewer than 2 slots).
export function findLunchBreak(slots: TimetableSlot[]): BreakWindow | null {
  if (slots.length < 2) return null;

  const sorted = [...slots].sort(
    (a, b) => toMinutes(a.startTime) - toMinutes(b.startTime),
  );
  const windowStart = toMinutes(LUNCH_WINDOW_START);
  const windowEnd = toMinutes(LUNCH_WINDOW_END);

  let best: { start: number; end: number } | null = null;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = toMinutes(sorted[i].endTime);
    const gapEnd = toMinutes(sorted[i + 1].startTime);
    const gapMinutes = gapEnd - gapStart;

    const looksLikeLunch =
      gapMinutes >= MIN_BREAK_MINUTES &&
      gapStart >= windowStart &&
      gapEnd <= windowEnd;

    if (looksLikeLunch && (!best || gapMinutes > best.end - best.start)) {
      best = { start: gapStart, end: gapEnd };
    }
  }

  return best ? { start: fromMinutes(best.start), end: fromMinutes(best.end) } : null;
}

export type OrderingWindowStatus =
  | { state: "open"; breakStart: string; breakEnd: string; closesInMinutes: number }
  | { state: "cutoff_passed"; breakStart: string; breakEnd: string }
  | { state: "no_break_today" };

// Ordering must happen at least `cutoffMinutes` before the break starts, so
// the mess has real lead time to prep — it does NOT stay open once the
// cutoff passes, even though the break itself hasn't started/ended yet.
// This is a pure function (no I/O, no throws) so it's safe to call on every
// render/tick without any try/catch around it.
export function getOrderingWindowStatus(
  timetable: Timetable | null,
  now: Date,
  cutoffMinutes = 15,
): OrderingWindowStatus {
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const daySchedule = timetable?.days.find((d) => d.day === dayName);
  const breakWindow = daySchedule ? findLunchBreak(daySchedule.slots) : null;

  if (!breakWindow) return { state: "no_break_today" };

  const breakStartMin = toMinutes(breakWindow.start);
  const breakEndMin = toMinutes(breakWindow.end);
  // Guard against a malformed/garbage timetable slot producing NaN times —
  // treat it the same as "no usable break" rather than propagating NaN
  // through comparisons (which would silently misbehave, not crash, but
  // let's not risk it).
  if (!Number.isFinite(breakStartMin) || !Number.isFinite(breakEndMin)) {
    return { state: "no_break_today" };
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const cutoffMin = breakStartMin - cutoffMinutes;

  if (nowMinutes < cutoffMin) {
    return {
      state: "open",
      breakStart: breakWindow.start,
      breakEnd: breakWindow.end,
      closesInMinutes: cutoffMin - nowMinutes,
    };
  }
  if (nowMinutes < breakEndMin) {
    return { state: "cutoff_passed", breakStart: breakWindow.start, breakEnd: breakWindow.end };
  }
  return { state: "no_break_today" }; // break already passed for today
}