import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firestore";

// SOS: a student presses and holds the SOS button → one doc in `sosAlerts`.
// A Cloud Function (sendSosPush) sends an SMS with the location to the
// student's saved emergency contacts, the doctor, wardens, medical committee
// and hostel committee (config/sos), and an app notification to responders; they see it live in
// the app (SOS alerts) and on the faculty portal's SOS board, mark "on my
// way" and then "resolved". While the alert is open the student's phone
// keeps refreshing `location` so responders always have the latest pin.

export type SosType = "medical" | "safety" | "other";
export type SosStatus = "open" | "acknowledged" | "resolved" | "cancelled";

export type SosLocation = { lat: number; lng: number; accuracy: number | null; at: number };

export type SosAlert = {
  id: string;
  studentUid: string;
  studentName: string;
  enrollmentNumber: string | null;
  branch: string | null;
  section: string | null;
  phone: string | null;
  type: SosType;
  note: string;
  status: SosStatus;
  location: SosLocation | null;
  ackBy: { name: string; email: string; at: number } | null;
  resolvedBy: { name: string; email: string; at: number } | null;
  createdAt: Timestamp | null;
  // Written by the server once the SMS has gone out.
  smsSent?: number;
  smsError?: string | null;
};

export type SosResponder = { name: string; role: string; phone?: string; email?: string };
export type SosConfig = {
  doctor?: SosResponder;
  wardens?: SosResponder[];
  // Extra numbers anyone can call from the SOS screen (security desk etc.).
  helplines?: SosResponder[];
  medicalCommittee?: SosResponder[];
  hostelCommittee?: SosResponder[];
  responderEmails?: string[];
};

export type EmergencyContact = { name: string; phone: string };

export const SOS_TYPES: { id: SosType; label: string; icon: string }[] = [
  { id: "medical", label: "Medical", icon: "medkit-outline" },
  { id: "safety", label: "Safety", icon: "shield-outline" },
  { id: "other", label: "Other", icon: "alert-circle-outline" },
];

export async function getSosConfig(): Promise<SosConfig | null> {
  const snap = await getDoc(doc(db, "config", "sos"));
  return snap.exists() ? (snap.data() as SosConfig) : null;
}

export async function raiseSos(params: {
  studentUid: string;
  studentName: string;
  enrollmentNumber?: string | null;
  branch?: string | null;
  section?: string | null;
  phone?: string | null;
  type: SosType;
  note: string;
  location: SosLocation | null;
}): Promise<string> {
  const ref = await addDoc(collection(db, "sosAlerts"), {
    studentUid: params.studentUid,
    studentName: params.studentName,
    enrollmentNumber: params.enrollmentNumber ?? null,
    branch: params.branch ?? null,
    section: params.section ?? null,
    phone: params.phone?.trim() || null,
    type: params.type,
    note: params.note.trim().slice(0, 500),
    status: "open",
    location: params.location,
    ackBy: null,
    resolvedBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function updateSosLocation(id: string, location: SosLocation) {
  return updateDoc(doc(db, "sosAlerts", id), { location, updatedAt: serverTimestamp() });
}

// Student side: "I'm safe" (cancelled) — or responder side: on my way / resolved.
export function setSosStatus(
  id: string,
  status: SosStatus,
  by?: { name: string; email: string },
) {
  const patch: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
  if (by && status === "acknowledged") patch.ackBy = { ...by, at: Date.now() };
  if (by && status === "resolved") patch.resolvedBy = { ...by, at: Date.now() };
  return updateDoc(doc(db, "sosAlerts", id), patch);
}

// The student's own alerts that are still active (normally zero or one).
export function subscribeToMyActiveSos(uid: string, onUpdate: (a: SosAlert | null) => void): () => void {
  const q = query(collection(db, "sosAlerts"), where("studentUid", "==", uid), where("status", "in", ["open", "acknowledged"]));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SosAlert, "id">) }));
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? Date.now()) - (a.createdAt?.toMillis?.() ?? Date.now()));
      onUpdate(list[0] ?? null);
    },
    () => onUpdate(null),
  );
}

// Responders: every alert still needing attention.
export function subscribeToActiveSos(
  onUpdate: (alerts: SosAlert[]) => void,
  onError?: (e: Error) => void,
): () => void {
  const q = query(collection(db, "sosAlerts"), where("status", "in", ["open", "acknowledged"]));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SosAlert, "id">) }));
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? Date.now()) - (a.createdAt?.toMillis?.() ?? Date.now()));
      onUpdate(list);
    },
    (e) => onError?.(e),
  );
}

export function saveEmergencyContacts(uid: string, contacts: EmergencyContact[]) {
  return updateDoc(doc(db, "users", uid), {
    emergencyContacts: contacts.slice(0, 3).map((c) => ({ name: c.name.trim(), phone: c.phone.trim() })),
  });
}

export const mapsUrl = (l: SosLocation) => `https://maps.google.com/?q=${l.lat},${l.lng}`;
