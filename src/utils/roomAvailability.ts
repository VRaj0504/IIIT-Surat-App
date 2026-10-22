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
  occupant: RoomOccupant | null;
};

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

export function fromMinutes(mins: number): string {
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

function sameDay(a: string, b: string): boolean {
  const norm = (s: string) => String(s ?? "").trim().slice(0, 3).toLowerCase();
  return norm(a) !== "" && norm(a) === norm(b);
}

function roomKey(room: string): string {
  return room.toUpperCase().replace(/[\s\-_.]+/g, "");
}

const BATCH_CODE = "(?:PG|UG|RS|PH|MT|MS)\\d{2}[A-Z]{1,4}\\d{1,3}";
const ONLY_BATCH_CODE = new RegExp(`^${BATCH_CODE}$`, "i");
const TRAILING_BATCH_CODE = new RegExp(`\\s+${BATCH_CODE}$`, "i");

function splitRooms(raw: string): string[] {
  return (raw ?? "")
    .split(/[\/,&;]+|\s+and\s+/i)
    .map((r) => r.trim().replace(TRAILING_BATCH_CODE, "").trim())
    .filter((r) => r && !ONLY_BATCH_CODE.test(r));
}

function slotRange(slot: { startTime: string; endTime: string }): { start: number; end: number } | null {
  const start = toMinutes(slot.startTime);
  if (start < 0) return null;
  let end = toMinutes(slot.endTime);
  if (end <= start) end = start + 60;
  return { start, end };
}

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

            occupantByKey.set(key, {
              branch: tt.branch,
              semester: tt.semester,
              section: tt.section,
              subjectName: slot.subjectName,
              faculty: slot.faculty,

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

  phase: "before" | "during" | "between" | "after";
};

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
