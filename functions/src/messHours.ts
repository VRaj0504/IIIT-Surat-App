// Server-side mirror of src/utils/messHours.ts + breakWindow.ts's toMinutes,
// kept in sync manually since Cloud Functions is a separate TS project from
// the Expo app and can't import across that boundary. IMPORTANT: unlike the
// client (which reads the phone's own local clock, already IST for every
// real user), Cloud Functions run in UTC by default — so "now" here is
// converted to IST explicitly. Getting this wrong would silently let the
// server reject/accept orders at the wrong wall-clock time even though the
// client-side check (in messService.ts) looked correct on the phone.

const IST_OFFSET_MINUTES = 5 * 60 + 30;

export const STORE_OPEN = "09:00";
export const STORE_CLOSE = "17:00";
export const PREP_LEAD_MINUTES = 15;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export type MessOrderingStatus =
  | { state: "open"; closesInMinutes: number }
  | { state: "before_open"; opensInMinutes: number }
  | { state: "closed_for_day" };

// Minutes-since-midnight IST for a given instant, and today's IST date key
// ("YYYY-M-D", matching the client's todayKey() format) — both derived from
// the same UTC->IST shift so a request near midnight can't land on the
// wrong side of the day boundary on one but not the other.
function istParts(now: Date): { minutesOfDay: number; dateKey: string } {
  const istMs = now.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
  const ist = new Date(istMs);
  const minutesOfDay = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const dateKey = `${ist.getUTCFullYear()}-${ist.getUTCMonth() + 1}-${ist.getUTCDate()}`;
  return {minutesOfDay, dateKey};
}

export function getMessOrderingStatus(now: Date): MessOrderingStatus {
  const {minutesOfDay} = istParts(now);
  const openMin = toMinutes(STORE_OPEN);
  const lastOrderMin = toMinutes(STORE_CLOSE) - PREP_LEAD_MINUTES;

  if (minutesOfDay < openMin) {
    return {state: "before_open", opensInMinutes: openMin - minutesOfDay};
  }
  if (minutesOfDay >= lastOrderMin) {
    return {state: "closed_for_day"};
  }
  return {state: "open", closesInMinutes: lastOrderMin - minutesOfDay};
}

export function todayKeyIST(now: Date): string {
  return istParts(now).dateKey;
}

// Mirrors upcomingSlots() in messService.ts: the next SLOT_LOOKAHEAD
// SLOT_MINUTES-wide slots from now (IST), snapped to a slot boundary.
export const SLOT_MINUTES = 10;
export const SLOT_LOOKAHEAD = 6;
export const SLOT_CAPACITY = 15;

export function upcomingSlotsIST(now: Date): string[] {
  const {minutesOfDay} = istParts(now);
  const open = toMinutes(STORE_OPEN);
  const close = toMinutes(STORE_CLOSE);
  const nowMinutes = Math.max(open, minutesOfDay);
  const start = nowMinutes - (nowMinutes % SLOT_MINUTES);
  const slots: string[] = [];
  for (let t = start; t < close && slots.length < SLOT_LOOKAHEAD; t += SLOT_MINUTES) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    slots.push(`${h}:${String(m).padStart(2, "0")}`);
  }
  if (slots.length === 0) {
    const t = close - SLOT_MINUTES;
    const h = Math.floor(t / 60);
    const m = t % 60;
    slots.push(`${h}:${String(m).padStart(2, "0")}`);
  }
  return slots;
}
