import { toMinutes } from "./breakWindow";

// The mess counter is simply open 9-5 now — every item (thali, dosa, poha,
// samosa, tea, ...) is orderable the whole window, not just at "lunchtime".
// This replaces the old per-section timetable-break window: that logic
// still lives in breakWindow.ts/getOrderingWindowStatus for anything that
// wants it later, but the mess screens no longer use it.
export const STORE_OPEN = "09:00";
export const STORE_CLOSE = "17:00";

// Orders stop being accepted this many minutes before close, so the kitchen
// always has real lead time to prep the last order of the day instead of
// someone tapping "order" at 4:59 for a 5:00 close.
export const PREP_LEAD_MINUTES = 15;

export type MessOrderingStatus =
  | { state: "open"; closesInMinutes: number }
  | { state: "before_open"; opensInMinutes: number }
  | { state: "closed_for_day" };

export function getMessOrderingStatus(now: Date): MessOrderingStatus {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMin = toMinutes(STORE_OPEN);
  const lastOrderMin = toMinutes(STORE_CLOSE) - PREP_LEAD_MINUTES;

  if (nowMinutes < openMin) {
    return { state: "before_open", opensInMinutes: openMin - nowMinutes };
  }
  if (nowMinutes >= lastOrderMin) {
    return { state: "closed_for_day" };
  }
  return { state: "open", closesInMinutes: lastOrderMin - nowMinutes };
}
