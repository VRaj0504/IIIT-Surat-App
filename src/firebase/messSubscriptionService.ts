import { doc, getDoc, serverTimestamp, runTransaction } from "firebase/firestore";
import { db } from "./firestore";

export type MealSlot = "lunch" ;

const MEAL_WINDOWS: { slot: MealSlot; startMinutes: number; endMinutes: number }[] = [

  { slot: "lunch", startMinutes: 12 * 60, endMinutes: 14 * 60 + 30 },

];

function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
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
  month?: string;
};

export async function checkMySubscription(enrollmentNumber: string): Promise<SubscriptionCheck> {
  const month = currentMonthKey();
  const snap = await getDoc(doc(db, "messSubscriptions", `${enrollmentNumber}_${month}`));
  if (!snap.exists()) return { active: false };
  const data = snap.data() as { active: boolean; name: string };
  return { active: data.active, name: data.name, month };
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
  const subscriptionRef = doc(db, "messSubscriptions", `${enrollmentNumber}_${month}`);
  const scanRef = doc(db, "messMealScans", `${enrollmentNumber}_${dateKey}_${mealSlot}`);

  return runTransaction(db, async (tx) => {
    const [subscriptionSnap, scanSnap] = await Promise.all([tx.get(subscriptionRef), tx.get(scanRef)]);

    if (!subscriptionSnap.exists() || !(subscriptionSnap.data() as { active: boolean }).active) {
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
