import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

const PING_URL = "https://www.gstatic.com/generate_204";
const CHECK_MS = 25_000;
const RECHECK_MS = 6_000;
const TIMEOUT_MS = 6_000;

async function reachable(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    await fetch(PING_URL, { method: "HEAD", cache: "no-store", signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * True while the device can reach the internet.
 * Web uses the browser's own signal. On phones it makes a tiny request while the app is open,
 * and reports offline only after two misses in a row so one slow request doesn't flash the banner.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;
      const sync = () => setOnline(navigator.onLine !== false);
      sync();
      window.addEventListener("online", sync);
      window.addEventListener("offline", sync);
      return () => {
        window.removeEventListener("online", sync);
        window.removeEventListener("offline", sync);
      };
    }

    let stopped = false;
    let misses = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      if (stopped || AppState.currentState !== "active") return;
      const ok = await reachable();
      if (stopped) return;
      misses = ok ? 0 : misses + 1;
      setOnline(misses < 2);
      timer = setTimeout(check, misses > 0 ? RECHECK_MS : CHECK_MS);
    };

    check();
    const sub = AppState.addEventListener("change", (s) => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (s === "active") check();
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return online;
}
