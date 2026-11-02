import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "./firestore";
import { persisted } from "./liveCache";

export type MessExtra = { id: string; name: string; price: number | null; order: number; available?: boolean };

export const DEFAULT_MESS_EXTRAS: MessExtra[] = ["Idli", "Paratha", "Maggi", "Thali", "Chai"].map((name, i) => ({
  id: `default-${i}`,
  name,
  price: null,
  order: i,
}));

export function subscribeToMessExtras(onUpdate: (items: MessExtra[]) => void): () => void {
  return persisted("messExtras", (emit, fail) =>
    onSnapshot(
      query(collection(db, "messAlwaysAvailable"), orderBy("order", "asc")),
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<MessExtra, "id">) }))
          .filter((x) => x.available !== false);
        emit(snap.empty ? DEFAULT_MESS_EXTRAS : items);
      },
      () => fail(DEFAULT_MESS_EXTRAS),
    ),
  onUpdate);
}
