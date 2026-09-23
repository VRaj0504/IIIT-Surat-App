import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "./firestore";

export type FacultyMember = {
  
  uid: string | null;
  email: string;
  name: string;
  department?: string;
  designation?: string;
  officeLocation?: string;
  officeHours?: string;
  phone?: string;
  // A brief "what and how many" summary faculty fill in themselves via
  // Edit Profile — never a full publication list, just enough for a
  // student browsing the directory to see the shape of someone's
  // research.
  researchAreas?: string;
  publicationsCount?: number | null;
  
  roleEmail?: string;
  shortForm?: string;
  // Department codes (see DEPARTMENT_LABELS in FacultyDirectoryScreen.tsx)
  // this person ALSO shows under, on top of their primary `department`
  // folder — e.g. someone whose home department is CSE but who's also
  // involved with MCS. Generalized from an earlier TnP-only version of
  // this (a single boolean flag) once a second, non-TnP cross-listing
  // came up — one mechanism for "also appears under folder X" covers
  // both instead of a new special-case flag per situation.
  additionalDepartments?: string[];
  // Specifically whether to show the purple "TNP INCHARGE" badge —
  // kept separate from additionalDepartments on purpose: someone can be
  // cross-listed under TNP without being a Faculty Incharge (unlikely
  // today, but the two are conceptually different things — one's about
  // which folder they appear in, the other's a specific title), and
  // this badge should never appear for a non-TnP cross-listing like
  // Pradeep Singh's CSE+MCS one.
  tnpInCharge?: boolean;
  
  signedUp: boolean;
};


export function subscribeToFacultyDirectory(
  onUpdate: (faculty: FacultyMember[]) => void,
): () => void {
  let fromUsers: FacultyMember[] = [];
  let fromAllowlist: FacultyMember[] = [];

  const emit = () => {
    const byEmail = new Map<string, FacultyMember>();
   
    for (const f of fromAllowlist) byEmail.set(f.email, f);
    for (const f of fromUsers) byEmail.set(f.email, f);
    
    const merged = Array.from(byEmail.values())
      .filter((f) => !f.email?.toLowerCase().endsWith("@gmail.com"))
            .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
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
          researchAreas: data.researchAreas,
          publicationsCount: data.publicationsCount,
          roleEmail: data.roleEmail,
          shortForm: data.shortForm,
          additionalDepartments: data.additionalDepartments,
          tnpInCharge: data.tnpInCharge,
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
        additionalDepartments: docSnap.data().additionalDepartments,
        tnpInCharge: docSnap.data().tnpInCharge,
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
