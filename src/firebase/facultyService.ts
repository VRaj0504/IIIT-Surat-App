import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "./firestore";
import { persisted } from "./liveCache";

export type FacultyMember = {

  uid: string | null;
  email: string;
  name: string;
  department?: string;
  designation?: string;
  officeLocation?: string;
  officeHours?: string;
  phone?: string;

  researchAreas?: string;
  publicationsCount?: number | null;
  aboutMe?: string;
  photoUrl?: string;

  inCabin?: boolean;

  roleEmail?: string;
  shortForm?: string;

  additionalDepartments?: string[];

  tnpInCharge?: boolean;
  hideFromDirectory?: boolean;

  signedUp: boolean;
};

export function subscribeToFacultyDirectory(
  onUpdate: (faculty: FacultyMember[]) => void,
): () => void {
  return persisted("faculty:directory", liveFacultyDirectory, onUpdate);
}

function liveFacultyDirectory(
  onUpdate: (faculty: FacultyMember[]) => void,
): () => void {
  let fromUsers: FacultyMember[] = [];
  let fromAllowlist: FacultyMember[] = [];

  const emit = () => {
    const byEmail = new Map<string, FacultyMember>();

    for (const f of fromAllowlist) byEmail.set(f.email, f);
    for (const f of fromUsers) byEmail.set(f.email, f);

    const merged = Array.from(byEmail.values())
      .filter((f) => !f.hideFromDirectory)
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
          aboutMe: data.aboutMe,
          photoUrl: data.photoUrl,
          inCabin: data.inCabin,
          roleEmail: data.roleEmail,
          shortForm: data.shortForm,
          additionalDepartments: data.additionalDepartments,
          tnpInCharge: data.tnpInCharge,
          hideFromDirectory: data.hideFromDirectory === true,
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
        hideFromDirectory: docSnap.data().hideFromDirectory === true,
        aboutMe: docSnap.data().aboutMe,
        photoUrl: docSnap.data().photoUrl,
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
