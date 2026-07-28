import React, { createContext, useContext, useEffect, useState } from 'react';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { auth } from '../firebase/auth';
import { db } from '../firebase/firestore';
import { claimPendingClubLead } from '../firebase/clubsService';

// Signup is restricted to the institute email domain. This doesn't by itself
// prove *whose* inbox it is — that's what email verification (below) is
// for — but it narrows the field before we even get there, and it's free
// (no Cloud Functions, no email-sending service; Firebase's own
// verification email covers it on the Spark/free plan).
export const ALLOWED_EMAIL_DOMAIN = '@iiitsurat.ac.in';

export function isAllowedEmailDomain(email: string): boolean {
  return email.trim().toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN);
}

export type Role = 'student' | 'faculty';

export type Branch = 'CSE' | 'ECE' | 'MNC';

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  role: Role;
  enrollmentNumber?: string;
  branch?: Branch;
  section?: string;
  admissionYear?: number;
};

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  initializing: boolean;
  profileLoading: boolean;
  signUp: (params: { name: string; email: string; password: string; role: Role; enrollmentNumber?: string }) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  updateProfileName: (name: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const justSignedUpRef = React.useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        if (!justSignedUpRef.current) {
          setProfileLoading(true);
          try {
            const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
            setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
          } finally {
            setProfileLoading(false);
          }
        }
      } else {
        setProfile(null);
      }
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  const signUp: AuthContextValue['signUp'] = async ({ name, email, password, role, enrollmentNumber }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const typedRegNo = (enrollmentNumber ?? '').trim().toUpperCase();

    // Reject off-domain emails before we ever create a Firebase Auth
    // account — no point spending an account-creation attempt (or letting
    // someone occupy an email slot) on an address that could never pass.
    if (!isAllowedEmailDomain(normalizedEmail)) {
      throw new Error(`Please sign up with your institute email (${ALLOWED_EMAIL_DOMAIN}).`);
    }

    
    justSignedUpRef.current = true;
    setProfileLoading(true);
    let credential;
    try {
      credential = await createUserWithEmailAndPassword(auth, email, password);

      // Faculty (and admin) accounts are gated by the `allowlist` collection,
      // keyed by lowercased email, admin-seeded via scripts/seed-allowlist.js.
      // Students are gated by the `roster` collection, keyed by enrollment
      // number, admin-seeded via scripts/seed-roster.js — there's no student
      // email list, so the enrollment number is the identity check instead.
      // This is a UX nicety only; the real enforcement is in firestore.rules,
      // since a client-side check alone can be bypassed by calling the API directly.
      let enrollmentNumberOut: string | undefined;
      let branchOut: Branch | undefined;
      let sectionOut: string | undefined;
      let admissionYearOut: number | undefined;

      if (role === 'faculty') {
        const allowSnap = await getDoc(doc(db, 'allowlist', normalizedEmail));
        if (!allowSnap.exists() || (allowSnap.data() as { role?: string }).role !== 'faculty') {
          throw new Error('This email is not on the approved faculty list. Contact an admin if you believe this is a mistake.');
        }
      } else {
        if (!typedRegNo) {
          throw new Error('Enrollment number is required for students.');
        }
        const rosterSnap = await getDoc(doc(db, 'roster', typedRegNo));
        if (!rosterSnap.exists()) {
          throw new Error('This enrollment number was not found on the student roster. Contact an admin if you believe this is a mistake.');
        }
        const rosterData = rosterSnap.data() as { branch: Branch; section: string; admissionYear: number };
        enrollmentNumberOut = typedRegNo;
        branchOut = rosterData.branch;
        sectionOut = rosterData.section;
        admissionYearOut = rosterData.admissionYear;
      }

      const newProfile: UserProfile = {
        uid: credential.user.uid,
        name,
        email: normalizedEmail,
        role,
        ...(enrollmentNumberOut ? { enrollmentNumber: enrollmentNumberOut } : {}),
        ...(branchOut ? { branch: branchOut } : {}),
        ...(sectionOut ? { section: sectionOut } : {}),
        ...(admissionYearOut ? { admissionYear: admissionYearOut } : {}),
      };
      await setDoc(doc(db, 'users', credential.user.uid), newProfile);
      setProfile(newProfile);
      // Best-effort: if a club was pre-assigned to this email before the person
      // signed up, link them as lead now. Never let this fail the signup itself.
      try {
        await claimPendingClubLead(credential.user.uid, normalizedEmail);
      } catch {
        // ignore — worst case, a faculty member links them later from the club page
      }
    } catch (err) {
      if (credential) {
        // The auth account exists but the gating check (or the profile
        // write) failed — remove it rather than leaving an orphaned,
        // profile-less account squatting on this email.
        await deleteUser(credential.user).catch(() => signOut(auth).catch(() => {}));
      } else {
        await signOut(auth).catch(() => {});
      }
      throw err;
    } finally {
      justSignedUpRef.current = false;
      setProfileLoading(false);
    }
  };

  const logIn: AuthContextValue['logIn'] = async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logOut = async () => {
    await signOut(auth);
  };

  // Only `name` is editable — role and email are fixed at signup (both by
  // UI convention and by firestore.rules, which reject a `users` update
  // that changes role/email). Everything else on the profile (enrollment
  // number, branch, section, admissionYear) comes from the roster and
  // isn't user-editable either.
  const updateProfileName: AuthContextValue['updateProfileName'] = async (name) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Name cannot be empty.');
    if (!user) throw new Error('You must be signed in.');
    await updateDoc(doc(db, 'users', user.uid), { name: trimmed });
    setProfile((prev) => (prev ? { ...prev, name: trimmed } : prev));
  };

  const sendPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        initializing,
        profileLoading,
        signUp,
        logIn,
        logOut,
        updateProfileName,
        sendPasswordReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}