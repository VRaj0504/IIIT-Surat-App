import { doc, getDoc, serverTimestamp, runTransaction } from "firebase/firestore";
import { db } from "./firestore";

export type MealSlot = "lunch" ;

const MEAL_WINDOWS: { slot: MealSlot; startMinutes: number; endMinutes: number }[] = [

  { slot: "lunch", startMinutes: 12 * 60, endMinutes: 14 * 60 + 30 },

];

function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function currentTermKey(now: Date = new Date()): string {
  return now.getMonth() + 1 >= 7 ? `${now.getFullYear()}-odd` : `${now.getFullYear()}-even`;
}

export function termLabel(termKey: string): string {
  const [y, half] = termKey.split("-");
  return half === "odd" ? `Odd semester (Jul–Dec ${y})` : `Even semester (Jan–Jun ${y})`;
}

export function termEndLabel(termKey: string): string {
  const [y, half] = termKey.split("-");
  return half === "odd" ? `31 Dec ${y}` : `30 Jun ${y}`;
}

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function monthEndLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function currentDateKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export function getCurrentMealSlot(now: Date = new Date()): MealSlot | null {
  const minutesOfDay = now.getHours() * 60 + now.getMinutes();
  const match = MEAL_WINDOWS.find((w) => minutesOfDay >= w.startMinutes && minutesOfDay <= w.endMinutes);
  return match?.slot ?? null;
}

export type SubscriptionCheck = {
  active: boolean;
  name?: string;
  period?: string;
  validTill?: string;
};

export async function checkMySubscription(enrollmentNumber: string): Promise<SubscriptionCheck> {
  const term = currentTermKey();
  const month = currentMonthKey();
  const [termSnap, monthSnap] = await Promise.all([
    getDoc(doc(db, "messSubscriptions", `${enrollmentNumber}_${term}`)),
    getDoc(doc(db, "messSubscriptions", `${enrollmentNumber}_${month}`)),
  ]);
  const t = termSnap.exists() ? (termSnap.data() as { active: boolean; name: string }) : null;
  if (t?.active) return { active: true, name: t.name, period: termLabel(term), validTill: termEndLabel(term) };
  const m = monthSnap.exists() ? (monthSnap.data() as { active: boolean; name: string }) : null;
  if (m?.active) return { active: true, name: m.name, period: monthLabel(month), validTill: monthEndLabel(month) };
  return { active: false };
}

export type ScanResult =
  | { status: "valid"; name: string; mealSlot: MealSlot }
  | { status: "not_subscribed" }
  | { status: "already_used"; mealSlot: MealSlot }
  | { status: "outside_meal_hours" };

export async function verifyAndLogMealScan(
  enrollmentNumber: string,
  scannedByUid: string,
): Promise<ScanResult> {
  const now = new Date();
  const mealSlot = getCurrentMealSlot(now);
  if (!mealSlot) return { status: "outside_meal_hours" };

  const month = currentMonthKey(now);
  const dateKey = currentDateKey(now);
  const termRef = doc(db, "messSubscriptions", `${enrollmentNumber}_${currentTermKey(now)}`);
  const subscriptionRef = doc(db, "messSubscriptions", `${enrollmentNumber}_${month}`);
  const scanRef = doc(db, "messMealScans", `${enrollmentNumber}_${dateKey}_${mealSlot}`);

  return runTransaction(db, async (tx) => {
    const [termSnap, monthSnap, scanSnap] = await Promise.all([tx.get(termRef), tx.get(subscriptionRef), tx.get(scanRef)]);
    const isActive = (s: typeof termSnap) => s.exists() && (s.data() as { active: boolean }).active;
    const subscriptionSnap = isActive(termSnap) ? termSnap : monthSnap;

    if (!isActive(subscriptionSnap)) {
      return { status: "not_subscribed" } as ScanResult;
    }
    if (scanSnap.exists()) {
      return { status: "already_used", mealSlot } as ScanResult;
    }

    const name = (subscriptionSnap.data() as { name: string }).name;
    tx.set(scanRef, {
      enrollmentNumber,
      name,
      mealSlot,
      dateKey,
      scannedAt: serverTimestamp(),
      scannedBy: scannedByUid,
    });
    return { status: "valid", name, mealSlot } as ScanResult;
  });
}

export type MealStatus = "scanned" | "missed" | "ongoing" | "upcoming";

export async function getTodaysMealStatus(
  enrollmentNumber: string,
): Promise<Record<MealSlot, MealStatus>> {
  const now = new Date();
  const dateKey = currentDateKey(now);
  const minutesOfDay = now.getHours() * 60 + now.getMinutes();

  const results = await Promise.all(
    MEAL_WINDOWS.map(async (w) => {
      const snap = await getDoc(doc(db, "messMealScans", `${enrollmentNumber}_${dateKey}_${w.slot}`));
      if (snap.exists()) return [w.slot, "scanned"] as const;
      if (minutesOfDay < w.startMinutes) return [w.slot, "upcoming"] as const;
      if (minutesOfDay <= w.endMinutes) return [w.slot, "ongoing"] as const;
      return [w.slot, "missed"] as const;
    }),
  );

  return Object.fromEntries(results) as Record<MealSlot, MealStatus>;
}
