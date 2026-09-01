import { doc, getDoc, serverTimestamp, runTransaction } from "firebase/firestore";
import { db } from "./firestore";

export type MealSlot = "breakfast" | "lunch" | "dinner";

// Meal windows for the Unlimited Thali plan — distinct from the wallet
// system's continuous STORE_OPEN/STORE_CLOSE, since a thali subscription
// is inherently meal-slot-based (breakfast/lunch/dinner), not a
// continuous ordering window. Adjust these to match the canteen's actual
// serving hours.
const MEAL_WINDOWS: { slot: MealSlot; startMinutes: number; endMinutes: number }[] = [
  { slot: "breakfast", startMinutes: 7 * 60 + 30, endMinutes: 9 * 60 + 30 },
  { slot: "lunch", startMinutes: 12 * 60, endMinutes: 14 * 60 + 30 },
  { slot: "dinner", startMinutes: 19 * 60, endMinutes: 21 * 60 + 30 },
];

function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// "2026-09" -> "September 2026" — for display on the student's ID card.
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

// Checks whether a given enrollment number has an active subscription for
// the current month — used by the student's own Thali Pass screen to
// decide whether to show a QR code at all.
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

// The core verification staff actually rely on at the door. Everything
// here happens inside a single Firestore transaction so two staff
// members scanning the same QR at the exact same moment can't both
// succeed — the second one always sees the first one's scan log and
// correctly reports "already used", never a race where both go through.
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

// Today's status across all 3 meal slots, for the student's own ID card —
// "missed" only once that meal's window has fully closed without a scan;
// a slot still in progress or not yet started is never shown as missed.
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
