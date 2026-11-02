import { useEffect, useState } from "react";

const SEEN_KEY = "cg:noticesSeenAt";
type State = { noticesSeenAt: number; lowAttendance: number | null };

function readSeen(): number {
  try {
    return Number(globalThis.localStorage?.getItem(SEEN_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

let state: State = { noticesSeenAt: readSeen(), lowAttendance: null };
const listeners = new Set<(s: State) => void>();
const emit = () => listeners.forEach((l) => l(state));

export function markNoticesSeen(at = Date.now()) {
  if (at <= state.noticesSeenAt) return;
  state = { ...state, noticesSeenAt: at };
  try {
    globalThis.localStorage?.setItem(SEEN_KEY, String(at));
  } catch {}
  emit();
}

export function setLowAttendance(n: number | null) {
  if (state.lowAttendance === n) return;
  state = { ...state, lowAttendance: n };
  emit();
}

export function useWebBadges(): State {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
