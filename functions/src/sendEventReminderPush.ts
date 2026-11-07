import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {tokensOf, wants, type UserDoc} from "./audience";

// Every 15 minutes: remind students who follow a club about its events starting in the next hour.
export const sendEventReminderPush = onSchedule(
  {schedule: "*/15 * * * *", timeZone: "Asia/Kolkata", region: "asia-south1"},
  async () => {
    const db = getFirestore();
    const now = Date.now();
    const snap = await db
      .collection("clubEvents")
      .where("dateTime", ">=", Timestamp.fromMillis(now))
      .where("dateTime", "<=", Timestamp.fromMillis(now + 60 * 60 * 1000))
      .get();

    for (const d of snap.docs) {
      const e = d.data() as {clubId?: string; clubName?: string; title?: string; venue?: string | null; dateTime?: Timestamp; reminderSent?: boolean};
      if (e.reminderSent || !e.clubId || !e.dateTime) continue;
      await d.ref.update({reminderSent: true});

      const followers = await db.collection("users").where("followedClubs", "array-contains", e.clubId).get();
      const tokens = new Set<string>();
      followers.docs.forEach((u) => {
        const user = u.data() as UserDoc;
        if (wants(user, "clubEvents")) tokensOf(user).forEach((t) => tokens.add(t));
      });
      if (!tokens.size) continue;

      const mins = Math.max(1, Math.round((e.dateTime.toMillis() - now) / 60000));
      const time = e.dateTime.toDate().toLocaleTimeString("en-IN", {hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata"});
      await sendExpoPush(
        Array.from(tokens),
        `${e.title ?? "Event"} starts in ${mins} min`,
        `${e.clubName ?? "Club"} · ${time}${e.venue ? ` · ${e.venue}` : ""}`,
        "sendEventReminderPush",
        {screen: "ClubDetail", clubId: e.clubId, clubName: e.clubName ?? ""},
      );
    }
  },
);
