import { Timetable } from "../firebase/timetableService";

export type RoomOccupant = {
  branch: string;
  semester: number;
  section: string;
  subjectName: string;
  faculty: string;
  startTime: string;
  endTime: string;
};

export type RoomStatus = {
  room: string;
  occupant: RoomOccupant | null; // null means free at this day/time
};

// Timetable times arrive in several shapes depending on which upload path
// wrote them: "9:00" (seed script / portal CSV), "09:00" (AI timetable
// import), "9:00 AM" / "2 PM" / "9.00" (typed by hand in the editor), and
// "2:00" meaning 2 PM (sheets whose headers say "2:00-3:00" with no AM/PM).
// The old strict "H:MM" regex rejected everything but the first, so those
// slots were silently skipped and their rooms showed as EMPTY.
//
// Classes only run in the daytime, so an hour of 1–7 with no AM/PM is
// read as PM ("2:00" -> 14:00). Returns minutes since midnight, -1 if
// unparseable.
export function toMinutes(time: string): number {
  const match = String(time ?? "")
    .trim()
    .match(/^(\d{1,2})(?:[:.](\d{2}))?\s*([AaPp])?\.?\s*[Mm]?\.?$/);
  if (!match) return -1;
  let h = parseInt(match[1], 10);
  const m = match[2] ? parseInt(match[2], 10) : 0;
  if (h > 23 || m > 59) return -1;
  const mer = match[3]?.toUpperCase();
  if (mer === "P" && h < 12) h += 12;
  else if (mer === "A" && h === 12) h = 0;
  else if (!mer && h >= 1 && h <= 7) h += 12;
  return h * 60 + m;
}

// Canonical "H:MM" (24h, un-padded hour) for a minutes value.
export function fromMinutes(mins: number): string {
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

// "Mon", "monday", " MONDAY " all match "Monday".
function sameDay(a: string, b: string): boolean {
  const norm = (s: string) => String(s ?? "").trim().slice(0, 3).toLowerCase();
  return norm(a) !== "" && norm(a) === norm(b);
}

// The same physical room is typed many ways across timetables: "C-101",
// "C101", "c 101", "C 101 " ... Each distinct string used to count as a
// DIFFERENT room, so a room that was busy under one spelling showed as
// free under another. Keys ignore case, spaces and hyphens/dots so all
// spellings collapse into one room; the screen still shows the first
// spelling it saw. (Names with extra words — e.g. someone's initials
// appended, "CR 1 DN" — can't be merged safely by code; fix those with
// the web portal's Room Cleanup tool.)
function roomKey(room: string): string {
  return room.toUpperCase().replace(/[\s\-_.]+/g, "");
}

// One slot's room field can name several rooms ("C101 / C102", "LAB1, LAB2",
// "A & B") — each of them is occupied, not one oddly-named room.
function splitRooms(raw: string): string[] {
  return (raw ?? "")
    .split(/[\/,&;]+|\s+and\s+/i)
    .map((r) => r.trim())
    .filter(Boolean);
}

// A slot with a missing/unparseable end time is treated as the standard
// one-hour period. Before, such a slot never counted as "occupied" at all,
// so its room always showed as free.
function slotRange(slot: { startTime: string; endTime: string }): { start: number; end: number } | null {
  const start = toMinutes(slot.startTime);
  if (start < 0) return null;
  let end = toMinutes(slot.endTime);
  if (end <= start) end = start + 60;
  return { start, end };
}

// A slot is "occupied" for `time >= start && time < end` — the end time
// itself counts as free (a class ending at 11:00 frees the room AT 11:00).
//
// Known rooms come from EVERY day of every timetable, not just the chosen
// day. Before, a room with no class on that particular day wasn't listed
// at all — so a room that was free all day never appeared in "Empty".
export function getRoomAvailability(
  timetables: Timetable[],
  day: string,
  time: string,
): RoomStatus[] {
  const timeMinutes = toMinutes(time);
  const displayByKey = new Map<string, string>();
  const occupantByKey = new Map<string, RoomOccupant>();

  for (const tt of timetables) {
    for (const dayEntry of tt.days ?? []) {
      for (const slot of dayEntry.slots ?? []) {
        const range = slotRange(slot);
        for (const roomName of splitRooms(slot.room)) {
          const key = roomKey(roomName);
          if (!key) continue;
          if (!displayByKey.has(key)) displayByKey.set(key, roomName);
          if (
            sameDay(dayEntry.day, day) &&
            range &&
            timeMinutes >= range.start &&
            timeMinutes < range.end
          ) {
            // If two sections are double-booked into one room at the same
            // time that's a timetable data problem; the last one scanned
            // is displayed.
            occupantByKey.set(key, {
              branch: tt.branch,
              semester: tt.semester,
              section: tt.section,
              subjectName: slot.subjectName,
              faculty: slot.faculty,
              // Normalized, so the "In use" card never shows "2:00 AM"
              // for a 2 PM class stored as "02:00".
              startTime: fromMinutes(range.start),
              endTime: fromMinutes(range.end),
            });
          }
        }
      }
    }
  }

  return Array.from(displayByKey.entries())
    .sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }))
    .map(([key, room]) => ({ room, occupant: occupantByKey.get(key) ?? null }));
}

// Every distinct start time across every section's timetable, in
// chronological order — the pickable time slots in the UI. De-duplicated
// by actual time, not text, so "9:00" and "09:00" are one pill, and
// returned in canonical "H:MM" form.
export function getAllTimeSlots(timetables: Timetable[]): string[] {
  const set = new Set<number>();
  for (const tt of timetables) {
    for (const day of tt.days ?? []) {
      for (const slot of day.slots ?? []) {
        const mins = toMinutes(slot.startTime);
        if (mins >= 0) set.add(mins);
      }
    }
  }
  return Array.from(set)
    .sort((a, b) => a - b)
    .map(fromMinutes);
}

export type SlotPick = {
  slot: string | null;
  // "before" = classes haven't started, "during" = a period is running,
  // "between" = a gap between two periods (next one is preselected),
  // "after" = the last period is over for today.
  phase: "before" | "during" | "between" | "after";
};

// Which pill to preselect. The old code picked the first slot that STARTS
// at/after now — i.e. the NEXT period, not the current one (at 10:30 it
// showed the 11:00 rooms). The current period is the latest one that has
// already started and not yet ended.
export function pickCurrentSlot(slots: string[], nowMinutes: number): SlotPick {
  if (slots.length === 0) return { slot: null, phase: "during" };
  const started = slots.filter((s) => toMinutes(s) <= nowMinutes);
  if (started.length === 0) return { slot: slots[0], phase: "before" };
  const latest = started[started.length - 1];
  if (nowMinutes < toMinutes(latest) + 60) return { slot: latest, phase: "during" };
  const next = slots.find((s) => toMinutes(s) > nowMinutes);
  if (next) return { slot: next, phase: "between" };
  return { slot: latest, phase: "after" };
}
