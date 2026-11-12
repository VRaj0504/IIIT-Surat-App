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
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from './firestore';
import { persisted } from './liveCache';
import { hideBlocked } from './moderationService';

export type Club = {
  id: string;
  name: string;
  category: string;
  description: string;
  leadUid: string | null;
  leadName: string;
  leadEmail: string | null;
  createdAt: Timestamp | null;
  parentClubId: string | null;

  additionalLeadEmails?: string[];
  additionalLeadNames?: string[];
  coreMembers?: ClubCoreMember[];
};

export type ClubCoreMember = { name: string; role: string };

export const CORE_ROLES = [
  "Co-lead",
  "Secretary",
  "Treasurer",
  "Tech head",
  "Design head",
  "Events head",
  "Content head",
  "PR & Outreach",
  "Sponsorship head",
  "Core member",
];

export async function updateClubCoreMembers(clubId: string, members: ClubCoreMember[]): Promise<void> {
  const clean = members
    .map((m) => ({ name: m.name.trim(), role: m.role.trim() || "Core member" }))
    .filter((m) => m.name)
    .slice(0, 20);
  await updateDoc(doc(db, CLUBS_COLLECTION, clubId), { coreMembers: clean });
}

export function formatClubLeads(club: Club): string {
  const names = [club.leadName, ...(club.additionalLeadNames ?? [])].filter(Boolean);
  const label = names.length > 1 ? "Leads" : "Lead";
  return `${label}: ${names.join(", ")}`;
}

export type ClubEvent = {
  id: string;
  clubId: string;
  clubName: string;
  title: string;
  description: string;
  dateTime: Timestamp;
  link?: string;
  venue?: string | null;
  category?: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
};

export const EVENT_CATEGORIES = ["Workshop", "Talk / Seminar", "Competition", "Hackathon", "Cultural", "Sports", "Meetup", "Other"] as const;

const CLUBS_COLLECTION = 'clubs';
const EVENTS_COLLECTION = 'clubEvents';

export async function createClub(
  name: string,
  category: string,
  description: string,
  leadName: string,
  leadEmail?: string,
  parentClubId?: string | null
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

  }

  const docRef = await addDoc(collection(db, CLUBS_COLLECTION), {
    name,
    category,
    description,
    leadUid,
    leadName: leadName.trim(),
    leadEmail: resolvedLeadEmail,
    createdAt: serverTimestamp(),
    parentClubId: parentClubId ?? null,
  });
  return docRef.id;
}

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

export async function revokeClubLeadAccess(clubId: string): Promise<void> {
  await updateDoc(doc(db, CLUBS_COLLECTION, clubId), {
    leadUid: null,
    leadEmail: null,
  });
}

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

export function subscribeToClubs(onUpdate: (clubs: Club[]) => void): () => void {
  const q = query(collection(db, CLUBS_COLLECTION), orderBy('name'));
  return persisted('clubs', (onUpdate, fail) => onSnapshot(q, (snapshot) => {
    const clubs: Club[] = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<Club, 'id'>),
    }));
    onUpdate(clubs);
  }, () => fail([])), onUpdate);
}

export async function createEvent(
  clubId: string,
  clubName: string,
  title: string,
  description: string,
  dateTime: Date,
  link: string,
  createdBy: string,
  createdByName: string,
  extra: { venue?: string | null; category?: string | null } = {}
): Promise<void> {
  await addDoc(collection(db, EVENTS_COLLECTION), {
    clubId,
    clubName,
    title,
    description,
    dateTime: Timestamp.fromDate(dateTime),
    ...(link ? { link } : {}),
    venue: extra.venue || null,
    category: extra.category || null,
    createdBy,
    createdByName,
    createdAt: serverTimestamp(),
  });
}

export async function updateEvent(
  eventId: string,
  title: string,
  description: string,
  dateTime: Date,
  link: string,
  extra: { venue?: string | null; category?: string | null } = {}
): Promise<void> {
  await updateDoc(doc(db, EVENTS_COLLECTION, eventId), {
    title,
    description,
    dateTime: Timestamp.fromDate(dateTime),
    venue: extra.venue || null,
    category: extra.category || null,
    ...(link && link.trim() ? { link: link.trim() } : { link: null }),
  });
}

export async function deleteEvent(eventId: string): Promise<void> {
  await deleteDoc(doc(db, EVENTS_COLLECTION, eventId));
}

export function subscribeToClubEvents(clubId: string, onUpdate: (events: ClubEvent[]) => void): () => void {
  const q = query(
    collection(db, EVENTS_COLLECTION),
    where('clubId', '==', clubId),
    where('dateTime', '>=', Timestamp.fromDate(new Date())),
    orderBy('dateTime', 'asc')
  );
  const shown = hideBlocked<ClubEvent>(onUpdate);
  const stop = persisted(`clubev:${clubId}`, (onUpdate, fail) => onSnapshot(q, (snapshot) => {
    const events: ClubEvent[] = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<ClubEvent, 'id'>),
    }));
    onUpdate(events);
  }, () => fail([])), shown.onUpdate);
  return () => {
    stop();
    shown.stop();
  };
}

export function subscribeToAllUpcomingEvents(onUpdate: (events: ClubEvent[]) => void): () => void {
  const now = Timestamp.fromDate(new Date());
  const q = query(
    collection(db, EVENTS_COLLECTION),
    where('dateTime', '>=', now),
    orderBy('dateTime', 'asc')
  );
  const shown = hideBlocked<ClubEvent>(onUpdate);
  const stop = persisted('events:upcoming', (onUpdate, fail) => onSnapshot(q, (snapshot) => {
    const events: ClubEvent[] = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<ClubEvent, 'id'>),
    }));
    onUpdate(events);
  }, () => fail([])), shown.onUpdate);
  return () => {
    stop();
    shown.stop();
  };
}
/** Events from the last `days` days (newest first), for the Past tab. */
export function subscribeToRecentPastEvents(onUpdate: (events: ClubEvent[]) => void, days = 30): () => void {
  const now = new Date();
  const q = query(
    collection(db, EVENTS_COLLECTION),
    where('dateTime', '>=', Timestamp.fromDate(new Date(now.getTime() - days * 86400000))),
    where('dateTime', '<', Timestamp.fromDate(now)),
    orderBy('dateTime', 'desc')
  );
  const shown = hideBlocked<ClubEvent>(onUpdate);
  const stop = onSnapshot(
    q,
    (snapshot) => shown.onUpdate(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubEvent, 'id'>) }))),
    () => shown.onUpdate([])
  );
  return () => {
    stop();
    shown.stop();
  };
}

// Clubs a student follows (stored on users/{uid}.followedClubs). Followers get a push 1 hour before each event.
const followOverride = new Map<string, boolean>();

export function isFollowingClub(saved: string[] | undefined, clubId: string): boolean {
  return followOverride.has(clubId) ? followOverride.get(clubId)! : !!saved?.includes(clubId);
}

export async function setFollowClub(uid: string, clubId: string, follow: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { followedClubs: follow ? arrayUnion(clubId) : arrayRemove(clubId) });
  followOverride.set(clubId, follow);
}
