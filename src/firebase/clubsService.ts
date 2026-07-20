import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firestore';

export type Club = {
  id: string;
  name: string;
  category: string;
  description: string;
  leadUid: string | null; // null until the lead has an account and gets linked
  leadName: string;
  leadEmail: string | null;
  createdAt: Timestamp | null;
};

export type ClubEvent = {
  id: string;
  clubId: string;
  clubName: string;
  title: string;
  description: string;
  dateTime: Timestamp;
  link?: string;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
};

const CLUBS_COLLECTION = 'clubs';
const EVENTS_COLLECTION = 'clubEvents';

// Faculty creates a new club. `leadName` is always required (just a display name).
// `leadEmail` is optional. If given and an account already exists with that email,
// we link it immediately. If given but no account exists yet, we still store the
// email as a "pending" claim — as soon as someone signs up with that exact email,
// claimPendingClubLead() links them automatically. Leave it blank to add the club
// with just a name, to be linked manually later via setClubLead().
export async function createClub(
  name: string,
  category: string,
  description: string,
  leadName: string,
  leadEmail?: string
): Promise<string> {
  let leadUid: string | null = null;
  let resolvedLeadEmail: string | null = null;

  if (leadEmail && leadEmail.trim()) {
    resolvedLeadEmail = leadEmail.trim().toLowerCase();
    const usersQuery = query(collection(db, 'users'), where('email', '==', resolvedLeadEmail));
    const snapshot = await getDocs(usersQuery);
    if (!snapshot.empty) {
      leadUid = snapshot.docs[0].id;
    }
    // If no account exists yet, leadUid stays null but resolvedLeadEmail is still
    // saved — this club is now "pending" that email and will self-link on signup.
  }

  const docRef = await addDoc(collection(db, CLUBS_COLLECTION), {
    name,
    category,
    description,
    leadUid,
    leadName: leadName.trim(),
    leadEmail: resolvedLeadEmail,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// Faculty sets/changes a club's lead — rename, relink to a different account,
// or reassign entirely (e.g. new lead each year). Pass no leadEmail to keep it
// unlinked (name-only) or to intentionally drop the previous account link.
// If the email doesn't have an account yet, it's saved as a pending claim and
// will self-link the moment that person signs up (see claimPendingClubLead).
export async function setClubLead(clubId: string, leadName: string, leadEmail?: string): Promise<void> {
  let leadUid: string | null = null;
  let resolvedLeadEmail: string | null = null;

  if (leadEmail && leadEmail.trim()) {
    resolvedLeadEmail = leadEmail.trim().toLowerCase();
    const usersQuery = query(collection(db, 'users'), where('email', '==', resolvedLeadEmail));
    const snapshot = await getDocs(usersQuery);
    if (!snapshot.empty) {
      leadUid = snapshot.docs[0].id;
    }
  }

  await updateDoc(doc(db, CLUBS_COLLECTION, clubId), {
    leadUid,
    leadName: leadName.trim(),
    leadEmail: resolvedLeadEmail,
  });
}

// Immediately revokes the current lead's posting access without changing the
// displayed name — useful the moment someone steps down, before a replacement
// is decided.
export async function revokeClubLeadAccess(clubId: string): Promise<void> {
  await updateDoc(doc(db, CLUBS_COLLECTION, clubId), {
    leadUid: null,
    leadEmail: null,
  });
}

// Called right after a new account is created. Finds any club(s) that were
// pre-assigned to this email (leadEmail set, leadUid still null — i.e. the
// lead hadn't signed up yet) and links this account as the lead. Safe to call
// for every signup; it's a no-op if nothing matches.
export async function claimPendingClubLead(uid: string, email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const pendingQuery = query(
    collection(db, CLUBS_COLLECTION),
    where('leadEmail', '==', normalizedEmail),
    where('leadUid', '==', null)
  );
  const snapshot = await getDocs(pendingQuery);
  await Promise.all(
    snapshot.docs.map((docSnap) => updateDoc(doc(db, CLUBS_COLLECTION, docSnap.id), { leadUid: uid }))
  );
}

// Live subscription to every club, alphabetical by name.
export function subscribeToClubs(onUpdate: (clubs: Club[]) => void): () => void {
  const q = query(collection(db, CLUBS_COLLECTION), orderBy('name'));
  return onSnapshot(q, (snapshot) => {
    const clubs: Club[] = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<Club, 'id'>),
    }));
    onUpdate(clubs);
  });
}

// The club's lead posts a new event.
export async function createEvent(
  clubId: string,
  clubName: string,
  title: string,
  description: string,
  dateTime: Date,
  link: string,
  createdBy: string,
  createdByName: string
): Promise<void> {
  await addDoc(collection(db, EVENTS_COLLECTION), {
    clubId,
    clubName,
    title,
    description,
    dateTime: Timestamp.fromDate(dateTime),
    ...(link ? { link } : {}),
    createdBy,
    createdByName,
    createdAt: serverTimestamp(),
  });
}

// Only the original poster can edit/delete their own event (enforced by
// firestore.rules — createdBy must match and can't be changed).
export async function updateEvent(
  eventId: string,
  title: string,
  description: string,
  dateTime: Date,
  link: string
): Promise<void> {
  await updateDoc(doc(db, EVENTS_COLLECTION, eventId), {
    title,
    description,
    dateTime: Timestamp.fromDate(dateTime),
    ...(link && link.trim() ? { link: link.trim() } : { link: null }),
  });
}

export async function deleteEvent(eventId: string): Promise<void> {
  await deleteDoc(doc(db, EVENTS_COLLECTION, eventId));
}

// Live subscription to one club's upcoming events, soonest first. Past events
// automatically drop off — an event's own date/time is its natural expiry,
// so nobody needs to remember to delete it afterward.
export function subscribeToClubEvents(clubId: string, onUpdate: (events: ClubEvent[]) => void): () => void {
  const q = query(
    collection(db, EVENTS_COLLECTION),
    where('clubId', '==', clubId),
    where('dateTime', '>=', Timestamp.fromDate(new Date())),
    orderBy('dateTime', 'asc')
  );
  return onSnapshot(q, (snapshot) => {
    const events: ClubEvent[] = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<ClubEvent, 'id'>),
    }));
    onUpdate(events);
  });
}

// Live subscription to every upcoming event across all clubs — the global feed.
export function subscribeToAllUpcomingEvents(onUpdate: (events: ClubEvent[]) => void): () => void {
  const now = Timestamp.fromDate(new Date());
  const q = query(
    collection(db, EVENTS_COLLECTION),
    where('dateTime', '>=', now),
    orderBy('dateTime', 'asc')
  );
  return onSnapshot(q, (snapshot) => {
    const events: ClubEvent[] = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<ClubEvent, 'id'>),
    }));
    onUpdate(events);
  });
}
