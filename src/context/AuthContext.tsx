import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';

import {
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  User,
} from 'firebase/auth';
import { doc, getDoc, updateDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth } from '../firebase/auth';
import { db } from '../firebase/firestore';
import { claimPendingClubLead } from '../firebase/clubsService';
import { registerForPushNotificationsAsync, clearPushToken } from '../firebase/pushService';

let GoogleSignin: typeof import('@react-native-google-signin/google-signin').GoogleSignin;
let isSuccessResponse: typeof import('@react-native-google-signin/google-signin').isSuccessResponse;
let googleSignInAvailable = true;
try {
  const googleSigninModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = googleSigninModule.GoogleSignin;
  isSuccessResponse = googleSigninModule.isSuccessResponse;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    // iPhone: the iOS OAuth client (see app.config.js). Ignored on Android.
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
} catch {
  googleSignInAvailable = false;
}

export const ALLOWED_EMAIL_DOMAIN = '@iiitsurat.ac.in';

// The single app-store reviewer login (email + password, created by
// scripts/create-reviewer.js). The only non-institute address that can sign in.
export const REVIEWER_EMAIL = 'reviewer@collegego.app';
export const isReviewerEmail = (email: string) => email.trim().toLowerCase() === REVIEWER_EMAIL;

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
  photoUrl?: string;
  // Up to 3 people the SOS screen can text with your location.
  emergencyContacts?: { name: string; phone: string }[];
  // Admin on top of the normal role (scripts/make-admin.js); not self-editable.
  isAdmin?: boolean;
  enrollmentNumber?: string;
  branch?: Branch;
  section?: string;
  specialization?: string;
  admissionYear?: number;
  program?: 'UG' | 'PG';
  department?: string;
  designation?: string;
  officeLocation?: string;
  officeHours?: string;
  phone?: string;
  researchAreas?: string;
  publicationsCount?: number | null;
  aboutMe?: string;
  inCabin?: boolean;
  reviewer?: boolean; // app-store review account (demo SOS)
  roleEmail?: string;
  shortForm?: string;
  expoPushToken?: string;
};

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  initializing: boolean;
  profileLoading: boolean;
  /** True when the profile fetch failed (offline etc.) — NOT the same as "no profile yet". */
  profileLoadFailed: boolean;
  retryProfileLoad: () => Promise<void>;
  /** Set when a sign-in was refused (e.g. non-institute Google account); shown on the login screens. */
  authError: string | null;
  clearAuthError: () => void;
  logIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  completeGoogleProfile: (params: { role: Role; enrollmentNumber?: string }) => Promise<void>;
  logOut: () => Promise<void>;
  updateProfileName: (name: string) => Promise<void>;
  updateFacultyDetails: (details: {
    department?: string;
    designation?: string;
    officeLocation?: string;
    officeHours?: string;
    phone?: string;
    researchAreas?: string;
    publicationsCount?: number | null;
    aboutMe?: string;
  }) => Promise<void>;
  updatePhone: (phone: string) => Promise<void>;
  updatePhoto: (photoUrl: string) => Promise<void>;
  setInCabin: (inCabin: boolean) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  previewRole: Role | null;
  setPreviewRole: (role: Role | null) => void;
};

// Turns Firebase's raw "Firebase: Error (auth/...)" text into something a
// person can act on. Returns null for "the user simply closed the window",
// which is not an error worth showing.
function friendlyGoogleError(err: any): string | null {
  switch (err?.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.';
    case 'auth/unauthorized-domain':
      return "This website's address isn't authorised for Google sign-in yet. An admin needs to add it in Firebase → Authentication → Settings → Authorized domains.";
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled for this project. An admin needs to enable it in Firebase → Authentication → Sign-in method.';
    case 'auth/network-request-failed':
      return 'No internet connection right now — check your connection and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'An account with this email already exists using a password. Log in with your email and password instead.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    default:
      return err?.message ?? 'Google sign-in failed. Please try again.';
  }
}

function friendlyAuthErrorMessage(err: any): string {
  const code = err?.code ?? "";
  const raw = err?.message ?? "";
  const isOffline =
    code === "unavailable" ||
    /offline|network|failed to get document/i.test(raw);
  if (isOffline) {
    return "No internet connection right now — check your connection and try again.";
  }
  // Profile creation is refused by the Firestore rules unless the account's
  // institute email is VERIFIED — which an email/password account usually
  // isn't. Before, this showed Firebase's raw "Missing or insufficient
  // permissions." with no hint what to do.
  if (code === "permission-denied" || /insufficient permissions/i.test(raw)) {
    return `This account's email isn't verified as an institute address. Log out, then use "Continue with Google" with your ${ALLOWED_EMAIL_DOMAIN} account.`;
  }
  return raw || "Something went wrong. Please try again.";
}


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
  let specializationOut: string | undefined;
  let admissionYearOut: number | undefined;
  let programOut: 'UG' | 'PG' | undefined;
  let departmentOut: string | undefined;
  let designationOut: string | undefined;
  let roleEmailOut: string | undefined;
  let shortFormOut: string | undefined;

  if (role === 'faculty') {
    const allowSnap = await getDoc(doc(db, 'allowlist', normalizedEmail));
    const allowData = allowSnap.data() as { role?: string; department?: string; designation?: string; roleEmail?: string; shortForm?: string } | undefined;
    if (!allowSnap.exists() || allowData?.role !== 'faculty') {
      throw new Error('This email is not on the approved faculty list. Contact an admin if you believe this is a mistake.');
    }
    
    departmentOut = allowData?.department;
    designationOut = allowData?.designation;
    roleEmailOut = allowData?.roleEmail;
    shortFormOut = allowData?.shortForm;
  } else {
    if (!typedRegNo) {
      throw new Error('Enrollment number is required for students.');
    }
    const rosterSnap = await getDoc(doc(db, 'roster', typedRegNo));
    if (!rosterSnap.exists()) {
      throw new Error('This enrollment number was not found on the student roster. Contact an admin if you believe this is a mistake.');
    }
    const rosterData = rosterSnap.data() as { branch: Branch; section: string; admissionYear: number; specialization?: string; program?: 'UG' | 'PG' };
    enrollmentNumberOut = typedRegNo;
    branchOut = rosterData.branch;
    sectionOut = rosterData.section;
    admissionYearOut = rosterData.admissionYear;
    specializationOut = rosterData.specialization;
    programOut = rosterData.program;
  }

  return {
    uid,
    name,
    email: normalizedEmail,
    role,
    ...(enrollmentNumberOut ? { enrollmentNumber: enrollmentNumberOut } : {}),
    ...(branchOut ? { branch: branchOut } : {}),
    ...(sectionOut ? { section: sectionOut } : {}),
    ...(specializationOut ? { specialization: specializationOut } : {}),
    ...(admissionYearOut ? { admissionYear: admissionYearOut } : {}),
    ...(programOut ? { program: programOut } : {}),
    ...(departmentOut ? { department: departmentOut } : {}),
    ...(designationOut ? { designation: designationOut } : {}),
    ...(roleEmailOut ? { roleEmail: roleEmailOut } : {}),
    ...(shortFormOut ? { shortForm: shortFormOut } : {}),
  };
}


async function createUserProfileAtomically(uid: string, profile: UserProfile): Promise<void> {
  const userRef = doc(db, 'users', uid);
  await runTransaction(db, async (tx) => {
    // Never overwrite an existing profile (a failed profile fetch must not
    // be able to wipe a faculty member's saved details).
    const existing = await tx.get(userRef);
    if (existing.exists()) {
      throw new Error('Your profile already exists. Please close and reopen the app.');
    }
    if (profile.role === 'student' && profile.enrollmentNumber) {
      const claimRef = doc(db, 'enrollmentClaims', profile.enrollmentNumber);
      const claimSnap = await tx.get(claimRef);
      if (claimSnap.exists()) {
        throw new Error(
          'This enrollment number is already associated with another account. Contact an admin if you believe this is a mistake.',
        );
      }
      tx.set(claimRef, { uid, claimedAt: serverTimestamp() });
    }
    tx.set(userRef, profile);
  });
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);


const DEV_PREVIEW_EMAIL = 'ug25cse114@iiitsurat.ac.in';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const clearAuthError = useCallback(() => setAuthError(null), []);
  const [previewRole, setPreviewRoleState] = useState<Role | null>(null);

  const setPreviewRole = useCallback(
    (role: Role | null) => {
      if (profile?.email !== DEV_PREVIEW_EMAIL) return; // silently ignored for everyone else
      setPreviewRoleState(role);
    },
    [profile?.email],
  );

  // Loads users/{uid}. A FAILED load (offline, timeout) is reported as
  // profileLoadFailed — never as "no profile", because "no profile" sends
  // the user to CompleteProfileScreen.
  const loadProfile = useCallback(async (firebaseUser: User) => {
    setProfileLoading(true);
    setProfileLoadFailed(false);
    try {
      const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
    } catch {
      setProfileLoadFailed(true);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // A Google-only account outside the institute domain is refused here,
      // BEFORE it is ever put into state — so the app never flashes the
      // "complete your profile" screen for it, and the login screen stays
      // mounted to show the reason (authError).
      if (firebaseUser) {
        const email = (firebaseUser.email ?? '').trim().toLowerCase();
        const googleOnly =
          firebaseUser.providerData.length > 0 &&
          firebaseUser.providerData.every((p) => p.providerId === 'google.com');
        if (googleOnly && !isAllowedEmailDomain(email)) {
          await deleteUser(firebaseUser).catch(() => signOut(auth).catch(() => {}));
          if (Platform.OS !== 'web' && googleSignInAvailable) {
            await GoogleSignin.signOut().catch(() => {});
          }
          setAuthError(
            `${email || 'That account'} isn't an institute account. Please sign in with your ${ALLOWED_EMAIL_DOMAIN} Google account.`,
          );
          setUser(null);
          setProfile(null);
          setProfileLoadFailed(false);
          setInitializing(false);
          return;
        }
      }
      setUser(firebaseUser);
      if (firebaseUser) {
        await loadProfile(firebaseUser);
        registerForPushNotificationsAsync(firebaseUser.uid);
      } else {
        setProfile(null);
        setProfileLoadFailed(false);
      }
      setInitializing(false);
    });
    return unsubscribe;
  }, [loadProfile]);

  // Only used by the redirect fallback above: when the browser comes back
  // from Google, surface any failure instead of silently showing the login
  // screen again.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    getRedirectResult(auth).catch((e) => {
      const message = friendlyGoogleError(e);
      if (message) setAuthError(message);
    });
  }, []);

  const retryProfileLoad = useCallback(async () => {
    if (auth.currentUser) await loadProfile(auth.currentUser);
  }, [loadProfile]);

  const logIn: AuthContextValue['logIn'] = useCallback(async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  
  function newGoogleProviderForcingAccountChooser(): GoogleAuthProvider {
    const provider = new GoogleAuthProvider();
    // hd = hint that narrows Google's account chooser to the institute domain.
    provider.setCustomParameters({ prompt: 'select_account', hd: ALLOWED_EMAIL_DOMAIN.slice(1) });
    return provider;
  }


  const signInWithGoogle: AuthContextValue['signInWithGoogle'] = useCallback(async () => {
    if (Platform.OS === 'web') {
      setAuthError(null);
      const provider = newGoogleProviderForcingAccountChooser();
      try {
        // A wrong-domain account is refused by the auth listener above,
        // before the UI ever sees it; the reason shows up as authError.
        await signInWithPopup(auth, provider);
      } catch (e: any) {
        if (e?.code === 'auth/popup-blocked') {
          // Some browsers (mostly phones) never allow the pop-up: fall back
          // to a full-page redirect. The result is picked up by the
          // getRedirectResult effect below when the page comes back.
          await signInWithRedirect(auth, provider);
          return;
        }
        const message = friendlyGoogleError(e);
        if (message === null) return; // user closed the window — not an error
        throw new Error(message);
      }
      return;
    }
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
    // Check the chosen account BEFORE touching Firebase: a wrong-domain
    // account then never becomes a signed-in user at all, so nothing flickers
    // and the error goes straight back to the login screen.
    const pickedEmail = (response.data.user?.email ?? '').trim().toLowerCase();
    if (!isAllowedEmailDomain(pickedEmail)) {
      await GoogleSignin.signOut().catch(() => {});
      throw new Error(
        `${pickedEmail || 'That account'} isn't an institute account. Please sign in with your ${ALLOWED_EMAIL_DOMAIN} Google account.`,
      );
    }
    const idToken = response.data.idToken;
    if (!idToken) {
      throw new Error('Google did not return an ID token. Please try again.');
    }
    setAuthError(null);
    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, credential);
  }, []);


  const completeGoogleProfile: AuthContextValue['completeGoogleProfile'] = useCallback(async ({ role, enrollmentNumber }) => {
    if (!user) throw new Error('You must be signed in.');
    const normalizedEmail = (user.email ?? '').trim().toLowerCase();
    try {
      const newProfile = await buildGatedProfile({
        uid: user.uid,
        name: user.displayName ?? 'Unnamed',
        normalizedEmail,
        role,
        enrollmentNumber,
      });
      await createUserProfileAtomically(user.uid, newProfile);
      setProfile(newProfile);
      try {
        await claimPendingClubLead(user.uid, normalizedEmail);
      } catch {
        // ignore — worst case, a faculty member links them later from the club page
      }
    } catch (err) {
      throw new Error(friendlyAuthErrorMessage(err));
    }
  }, [user]);

  const logOut = useCallback(async () => {
    
    if (user) {
      await clearPushToken(user.uid);
    }
    await signOut(auth);
    setPreviewRoleState(null);
    
    if (Platform.OS !== 'web' && googleSignInAvailable) {
      await GoogleSignin.signOut().catch(() => {});
    }
  }, [user]);

  
  const updateProfileName: AuthContextValue['updateProfileName'] = useCallback(async (name) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Name cannot be empty.');
    if (!user) throw new Error('You must be signed in.');
    await updateDoc(doc(db, 'users', user.uid), { name: trimmed });
    setProfile((prev) => (prev ? { ...prev, name: trimmed } : prev));
  }, [user]);

  const updateFacultyDetails: AuthContextValue['updateFacultyDetails'] = useCallback(async (details) => {
    if (!user) throw new Error('You must be signed in.');
    
    const patch: Record<string, string | number | null> = {};
    (Object.keys(details) as (keyof typeof details)[]).forEach((key) => {
      const value = details[key];
      if (value === undefined) return;
      patch[key] = key === 'publicationsCount' ? (value as number | null) : (value as string).trim();
    });
    await updateDoc(doc(db, 'users', user.uid), patch);
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, [user]);

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  
  const updatePhone: AuthContextValue['updatePhone'] = useCallback(async (phone) => {
    if (!user) throw new Error('You must be signed in.');
    const trimmed = phone.trim();
    await updateDoc(doc(db, 'users', user.uid), { phone: trimmed });
    setProfile((prev) => (prev ? { ...prev, phone: trimmed } : prev));
  }, [user]);

  
  const updatePhoto: AuthContextValue['updatePhoto'] = useCallback(async (photoUrl) => {
    if (!user) throw new Error('You must be signed in.');
    await updateDoc(doc(db, 'users', user.uid), { photoUrl });
    setProfile((prev) => (prev ? { ...prev, photoUrl } : prev));
  }, [user]);

  const setInCabin: AuthContextValue['setInCabin'] = useCallback(async (inCabin) => {
    if (!user) throw new Error('You must be signed in.');
    await updateDoc(doc(db, 'users', user.uid), { inCabin });
    setProfile((prev) => (prev ? { ...prev, inCabin } : prev));
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      initializing,
      profileLoading,
      profileLoadFailed,
      retryProfileLoad,
      authError,
      clearAuthError,
      logIn,
      signInWithGoogle,
      completeGoogleProfile,
      logOut,
      updateProfileName,
      updateFacultyDetails,
      updatePhone,
      updatePhoto,
      setInCabin,
      sendPasswordReset,
      previewRole,
      setPreviewRole,
    }),
    [
      user,
      profile,
      initializing,
      profileLoading,
      profileLoadFailed,
      retryProfileLoad,
      authError,
      clearAuthError,
      logIn,
      signInWithGoogle,
      completeGoogleProfile,
      logOut,
      updateProfileName,
      updateFacultyDetails,
      updatePhone,
      updatePhoto,
      setInCabin,
      sendPasswordReset,
      previewRole,
      setPreviewRole,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}