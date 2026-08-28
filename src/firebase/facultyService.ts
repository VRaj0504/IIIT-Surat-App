import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "./firestore";

export type FacultyMember = {
  // null until this person actually signs in for the first time — see
  // `signedUp` below. Contact still works fine via email regardless.
  uid: string | null;
  email: string;
  name: string;
  department?: string;
  designation?: string;
  officeLocation?: string;
  officeHours?: string;
  phone?: string;
  // A role-based address (e.g. hod.cse@iiitsurat.ac.in) that persists
  // across whoever currently holds the position — set alongside a
  // "...& Head"/Dean designation in the allowlist. Shown as a second
  // contact option, not a replacement for the personal email.
  roleEmail?: string;
  shortForm?: string;
  // False for someone who's on the official allowlist but hasn't opened
  // the app yet — office hours/phone/designation can't exist for them
  // yet since those are self-filled via EditProfileScreen after signup.
  signedUp: boolean;
};

// Merges two sources so the directory shows every official faculty member
// immediately, not just the ones who've signed in at least once:
//  - `users` (role == 'faculty'): real signed-up profiles, with whatever
//    department/designation/office info they've filled in themselves.
//  - `allowlist` (role == 'faculty'): the full official roster (see
//    scripts/seed-allowlist.js), keyed by email, with just name+department
//    — this is what shows for anyone who hasn't signed up yet.
// Entries are merged by email; a signed-up profile always wins over the
// allowlist-only entry for the same person, since it's fuller/more current.
export function subscribeToFacultyDirectory(
  onUpdate: (faculty: FacultyMember[]) => void,
): () => void {
  let fromUsers: FacultyMember[] = [];
  let fromAllowlist: FacultyMember[] = [];

  const emit = () => {
    const byEmail = new Map<string, FacultyMember>();
    // Allowlist entries go in first, `users` entries overwrite them below —
    // that ordering is what makes "signed-up wins" work with a plain set().
    for (const f of fromAllowlist) byEmail.set(f.email, f);
    for (const f of fromUsers) byEmail.set(f.email, f);
    // Drops any account signed up with a personal @gmail.com address —
    // these are leftover test/demo accounts from before signup was gated
    // to @iiitsurat.ac.in only (see AuthContext.ts's isAllowedEmailDomain
    // check); no real faculty entry should ever have one.
    const merged = Array.from(byEmail.values())
      .filter((f) => !f.email?.toLowerCase().endsWith("@gmail.com"))
      .sort((a, b) => a.name.localeCompare(b.name));
    onUpdate(merged);
  };

  const usersQuery = query(
    collection(db, "users"),
    where("role", "==", "faculty"),
    orderBy("name", "asc"),
  );
  const unsubUsers = onSnapshot(
    usersQuery,
    (snapshot) => {
      fromUsers = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          uid: docSnap.id,
          email: data.email,
          name: data.name,
          department: data.department,
          designation: data.designation,
          officeLocation: data.officeLocation,
          officeHours: data.officeHours,
          phone: data.phone,
          roleEmail: data.roleEmail,
          shortForm: data.shortForm,
          signedUp: true,
        };
      });
      emit();
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[facultyService] users subscription error:", err);
    },
  );

  const allowlistQuery = query(collection(db, "allowlist"), where("role", "==", "faculty"));
  const unsubAllowlist = onSnapshot(
    allowlistQuery,
    (snapshot) => {
      fromAllowlist = snapshot.docs.map((docSnap) => ({
        uid: null,
        email: docSnap.id,
        name: docSnap.data().name,
        department: docSnap.data().department,
        designation: docSnap.data().designation,
        roleEmail: docSnap.data().roleEmail,
        shortForm: docSnap.data().shortForm,
        signedUp: false,
      }));
      emit();
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[facultyService] allowlist subscription error:", err);
    },
  );

  return () => {
    unsubUsers();
    unsubAllowlist();
  };
}
