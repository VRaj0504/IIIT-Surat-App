import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firestore";
import { persisted } from "./liveCache";
import { messMenu as DEFAULT_MENU, DayMenu } from "../data/messMenu";

// The weekly mess menu. Staff edit it in the faculty portal (saved at config/messMenu);
// until they save one, the menu built into the app is shown.

export const MESS_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

type SavedMenu = { days?: { day?: unknown; lunch?: unknown }[] } | undefined;

function fromSaved(saved: SavedMenu): DayMenu[] | null {
  if (!saved || !Array.isArray(saved.days)) return null;
  const out: DayMenu[] = MESS_DAYS.map((day) => {
    const found = saved.days!.find((d) => String(d?.day ?? "").toLowerCase() === day.toLowerCase());
    const items = Array.isArray(found?.lunch)
      ? (found!.lunch as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 20)
      : [];
    return { day, meals: { Lunch: items } };
  });
  return out.some((d) => d.meals.Lunch.length > 0) ? out : null;
}

export function subscribeToMessMenu(onUpdate: (menu: DayMenu[]) => void): () => void {
  return persisted<DayMenu[]>(
    "messMenu",
    (push, fail) =>
      onSnapshot(
        doc(db, "config", "messMenu"),
        (snap) => push(fromSaved(snap.data() as SavedMenu) ?? DEFAULT_MENU),
        () => fail(DEFAULT_MENU),
      ),
    onUpdate,
  );
}

/** The current weekly menu, live. Starts with the built-in menu so the screen is never empty. */
export function useMessMenu(): DayMenu[] {
  const [menu, setMenu] = useState<DayMenu[]>(DEFAULT_MENU);
  useEffect(() => subscribeToMessMenu(setMenu), []);
  return menu;
}
