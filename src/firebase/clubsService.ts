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
import { persisted } from './liveCache';

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
};

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
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
};

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
  return persisted('clubs', (onUpdate) => onSnapshot(q, (snapshot) => {
    const clubs: Club[] = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<Club, 'id'>),
    }));
    onUpdate(clubs);
  }), onUpdate);
}

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

export function subscribeToClubEvents(clubId: string, onUpdate: (events: ClubEvent[]) => void): () => void {
  const q = query(
    collection(db, EVENTS_COLLECTION),
    where('clubId', '==', clubId),
    where('dateTime', '>=', Timestamp.fromDate(new Date())),
    orderBy('dateTime', 'asc')
  );
  return persisted(`clubev:${clubId}`, (onUpdate) => onSnapshot(q, (snapshot) => {
    const events: ClubEvent[] = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<ClubEvent, 'id'>),
    }));
    onUpdate(events);
  }), onUpdate);
}

export function subscribeToAllUpcomingEvents(onUpdate: (events: ClubEvent[]) => void): () => void {
  const now = Timestamp.fromDate(new Date());
  const q = query(
    collection(db, EVENTS_COLLECTION),
    where('dateTime', '>=', now),
    orderBy('dateTime', 'asc')
  );
  return persisted('events:upcoming', (onUpdate) => onSnapshot(q, (snapshot) => {
    const events: ClubEvent[] = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<ClubEvent, 'id'>),
    }));
    onUpdate(events);
  }), onUpdate);
}