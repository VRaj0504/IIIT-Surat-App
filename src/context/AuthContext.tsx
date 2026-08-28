import React, { createContext, useContext, useEffect, useState } from 'react';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider,
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

// NOTE: this is intentionally NOT a static `import` for GoogleSignin. This
// package's native-module spec file runs `TurboModuleRegistry.getEnforcing(...)`
// at module top-level, which throws synchronously the moment the module is
// evaluated — and with a static import, that evaluation is hoisted and runs
// before ANY of this file's own code, so no try/catch in this file could ever
// catch it. Expo Go has no binding for this native module, so a static import
// crashes the whole app on launch there. A `require()` call, by contrast,
// runs exactly where it's written — wrapping it here lets us catch the throw
// and degrade gracefully instead. Under a dev client / standalone build this
// resolves normally and behaves identically to a static import.
let GoogleSignin: typeof import('@react-native-google-signin/google-signin').GoogleSignin;
let isSuccessResponse: typeof import('@react-native-google-signin/google-signin').isSuccessResponse;
let googleSignInAvailable = true;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const googleSigninModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = googleSigninModule.GoogleSignin;
  isSuccessResponse = googleSigninModule.isSuccessResponse;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
} catch {
  googleSignInAvailable = false;
}

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
  // Faculty-only, optional — self-filled via EditProfileScreen, shown in
  // FacultyDirectoryScreen. Left blank by default; nothing here is
  // required at signup since the allowlist gate already covers who's
  // allowed to be faculty at all.
  department?: string;
  designation?: string;
  officeLocation?: string;
  officeHours?: string;
  phone?: string;
  // Set only via the allowlist at signup (see scripts/seed-allowlist.js),
  // never self-edited — a role-based address like hod.cse@iiitsurat.ac.in
  // that stays valid across whoever currently holds that position.
  roleEmail?: string;
};

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  initializing: boolean;
  profileLoading: boolean;
  signUp: (params: { name: string; email: string; password: string; role: Role; enrollmentNumber?: string }) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  completeGoogleProfile: (params: { role: Role; enrollmentNumber?: string }) => Promise<void>;
  logOut: () => Promise<void>;
  updateProfileName: (name: string) => Promise<void>;
  // Faculty-only fields (see UserProfile) — a partial update, so callers
  // only send what changed rather than the whole profile every time.
  updateFacultyDetails: (details: {
    department?: string;
    designation?: string;
    officeLocation?: string;
    officeHours?: string;
    phone?: string;
  }) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
};

// Shared by email/password signUp and completeGoogleProfile — both need to
// check the same admin-seeded allowlist/roster collections before a profile
// doc can be created. Throws a user-facing Error on any gating failure.
async function buildGatedProfile(params: {
  uid: string;
  name: string;
  normalizedEmail: string;
  role: Role;
  enrollmentNumber?: string;
}): Promise<UserProfile> {
  const { uid, name, normalizedEmail, role } = params;
  const typedRegNo = (params.enrollmentNumber ?? '').trim().toUpperCase();

  let enrollmentNumberOut: string | undefined;
  let branchOut: Branch | undefined;
  let sectionOut: string | undefined;
  let admissionYearOut: number | undefined;
  let departmentOut: string | undefined;
  let designationOut: string | undefined;
  let roleEmailOut: string | undefined;

  if (role === 'faculty') {
    const allowSnap = await getDoc(doc(db, 'allowlist', normalizedEmail));
    const allowData = allowSnap.data() as { role?: string; department?: string; designation?: string; roleEmail?: string } | undefined;
    if (!allowSnap.exists() || allowData?.role !== 'faculty') {
      throw new Error('This email is not on the approved faculty list. Contact an admin if you believe this is a mistake.');
    }
    // Carries the department code, designation, and (for a HOD/Dean) their
    // role-based email address — all already seeded in the allowlist (see
    // scripts/seed-allowlist.js) — straight onto the profile at signup, the
    // same way a student's branch/section come from the roster below — so
    // this shows up correctly in FacultyDirectoryScreen immediately, with
    // no manual entry needed. A faculty member can still overwrite either
    // via EditProfileScreen later — this is just what's true from day one.
    // roleEmail specifically MUST be carried over here: once someone signs
    // up, their `users` doc takes over from the allowlist entry in
    // FacultyDirectoryScreen's merge (see facultyService.ts) — without
    // copying it here, a HOD's office email would silently vanish from the
    // directory the moment they actually signed in.
    departmentOut = allowData?.department;
    designationOut = allowData?.designation;
    roleEmailOut = allowData?.roleEmail;
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

  return {
    uid,
    name,
    email: normalizedEmail,
    role,
    ...(enrollmentNumberOut ? { enrollmentNumber: enrollmentNumberOut } : {}),
    ...(branchOut ? { branch: branchOut } : {}),
    ...(sectionOut ? { section: sectionOut } : {}),
    ...(admissionYearOut ? { admissionYear: admissionYearOut } : {}),
    ...(departmentOut ? { department: departmentOut } : {}),
    ...(designationOut ? { designation: designationOut } : {}),
    ...(roleEmailOut ? { roleEmail: roleEmailOut } : {}),
  };
}

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
      const newProfile = await buildGatedProfile({
        uid: credential.user.uid,
        name,
        normalizedEmail,
        role,
        enrollmentNumber: typedRegNo,
      });
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

  // Kicks off the native Google account picker, then exchanges the Google
  // idToken for a Firebase credential. Domain gating happens here (same
  // @iiitsurat.ac.in restriction as email signup); role/enrollment gating
  // (allowlist/roster) happens afterwards in completeGoogleProfile, once we
  // know whether this is a brand-new sign-in or a returning user.
  const signInWithGoogle: AuthContextValue['signInWithGoogle'] = async () => {
    if (!googleSignInAvailable) {
      throw new Error(
        'Google Sign-In needs a dev build — it isn\'t available in Expo Go. Use email/password to sign in here, or run a dev client build to test this.'
      );
    }
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      // User cancelled the picker — not an error, just a no-op.
      return;
    }
    const idToken = response.data.idToken;
    if (!idToken) {
      throw new Error('Google did not return an ID token. Please try again.');
    }
    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, credential);
    const normalizedEmail = (userCredential.user.email ?? '').trim().toLowerCase();

    if (!isAllowedEmailDomain(normalizedEmail)) {
      // Wrong-domain Google account — this Firebase Auth user is brand new
      // and useless without a profile, so remove it rather than leaving an
      // orphaned account behind.
      await deleteUser(userCredential.user).catch(() => signOut(auth).catch(() => {}));
      throw new Error(`Please sign in with your institute Google account (${ALLOWED_EMAIL_DOMAIN}).`);
    }
    // If a profile doc already exists, onAuthStateChanged's listener will
    // pick it up normally. If not, we leave the user signed in with
    // profile === null — the Gate component shows the complete-profile
    // screen, and completeGoogleProfile finishes setup from there.
  };

  // Called from the complete-profile screen after a first-time Google
  // sign-in, once the person has picked a role (and, for students, entered
  // an enrollment number).
  const completeGoogleProfile: AuthContextValue['completeGoogleProfile'] = async ({ role, enrollmentNumber }) => {
    if (!user) throw new Error('You must be signed in.');
    const normalizedEmail = (user.email ?? '').trim().toLowerCase();
    const newProfile = await buildGatedProfile({
      uid: user.uid,
      name: user.displayName ?? 'Unnamed',
      normalizedEmail,
      role,
      enrollmentNumber,
    });
    await setDoc(doc(db, 'users', user.uid), newProfile);
    setProfile(newProfile);
    try {
      await claimPendingClubLead(user.uid, normalizedEmail);
    } catch {
      // ignore — worst case, a faculty member links them later from the club page
    }
  };

  const logOut = async () => {
    await signOut(auth);
    // Best-effort — clears Google's local session so the next sign-in shows
    // the account picker again instead of silently reusing the last account.
    // Harmless no-op for users who never signed in with Google.
    if (googleSignInAvailable) {
      await GoogleSignin.signOut().catch(() => {});
    }
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

  const updateFacultyDetails: AuthContextValue['updateFacultyDetails'] = async (details) => {
    if (!user) throw new Error('You must be signed in.');
    // Trim every field that was actually passed; leave anything not
    // included in `details` untouched on both Firestore and local state.
    const patch: Record<string, string> = {};
    (Object.keys(details) as (keyof typeof details)[]).forEach((key) => {
      const value = details[key];
      if (value !== undefined) patch[key] = value.trim();
    });
    await updateDoc(doc(db, 'users', user.uid), patch);
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
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
        signInWithGoogle,
        completeGoogleProfile,
        logOut,
        updateProfileName,
        updateFacultyDetails,
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