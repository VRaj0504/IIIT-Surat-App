import { AppState } from "react-native";
import { doc, increment, serverTimestamp, setDoc } from "firebase/firestore";
import { auth } from "../firebase/auth";
import { db } from "../firebase/firestore";

// Counts which screens people open, so we can see what is used. No names, emails or ids are stored:
// one document per day holds a number per screen. Counts are held in memory and saved in one write
// every couple of minutes (and when the app goes to the background) to keep writes low.

const FLUSH_MS = 120_000;
const pending = new Map<string, number>();
let opens = 0;
let countedOpen = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

/** Today's date in India, as YYYY-MM-DD. */
function today(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

async function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!auth.currentUser || (pending.size === 0 && opens === 0)) return;
  const screens: Record<string, ReturnType<typeof increment>> = {};
  pending.forEach((n, name) => (screens[name] = increment(n)));
  const sentOpens = opens;
  const sent = new Map(pending);
  pending.clear();
  opens = 0;
  try {
    await setDoc(
      doc(db, "usageDaily", today()),
      { screens, ...(sentOpens ? { opens: increment(sentOpens) } : {}), updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch {
    // Offline or not allowed yet: keep the counts and try again on the next flush.
    sent.forEach((n, name) => pending.set(name, (pending.get(name) ?? 0) + n));
    opens += sentOpens;
  }
}

/** Call with the screen's route name each time the user lands on a screen. */
export function trackScreen(name: string | undefined) {
  if (!name || !/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(name) || !auth.currentUser) return;
  if (!countedOpen) {
    countedOpen = true;
    opens += 1;
  }
  pending.set(name, (pending.get(name) ?? 0) + 1);
  if (!listening) {
    listening = true;
    AppState.addEventListener("change", (s) => {
      if (s !== "active") flush();
    });
  }
  if (!timer) timer = setTimeout(flush, FLUSH_MS);
}
