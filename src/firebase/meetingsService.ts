import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "./firestore";

export type Meeting = {
  id: string;
  title: string;
  agenda?: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  venue: string;
  status: "scheduled" | "cancelled";
  createdByName?: string;
  audienceLabel?: string;
  acked: boolean;
};

export const localIso = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const meetingClock = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

export const meetingWhen = (m: Pick<Meeting, "date" | "startTime" | "endTime">) => {
  const d = new Date(`${m.date}T00:00:00`);
  const day = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  return `${day}, ${meetingClock(m.startTime)}${m.endTime ? ` – ${meetingClock(m.endTime)}` : ""}`;
};

export function subscribeMyMeetings(uid: string, cb: (items: Meeting[]) => void, sinceDays = 0): () => void {
  const acked = new Map<string, boolean>();
  let latest: Omit<Meeting, "acked">[] = [];
  const emit = () => cb(latest.map((m) => ({ ...m, acked: acked.get(m.id) ?? false })));
  return onSnapshot(
    query(collection(db, "meetings"), where("recipientUids", "array-contains", uid)),
    (snap) => {
      const since = new Date();
      since.setDate(since.getDate() - sinceDays);
      const from = localIso(since);
      latest = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Meeting, "id" | "acked">) }))
        .filter((m) => m.date >= from)
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
      emit();
      latest.forEach((m) => {
        if (acked.has(m.id)) return;
        getDoc(doc(db, "meetings", m.id, "acks", uid))
          .then((a) => {
            acked.set(m.id, a.exists());
            emit();
          })
          .catch(() => undefined);
      });
    },
    () => cb([]),
  );
}

export async function acknowledgeMeeting(meetingId: string, uid: string, name: string, role: string): Promise<void> {
  await setDoc(doc(db, "meetings", meetingId, "acks", uid), { name, role, at: serverTimestamp() });
}
