// The one place in the functions that names the college. Keep it the same as src/config/college.ts
// in the app and the domain in firestore.rules.
export const COLLEGE_DOMAIN = "@iiitsurat.ac.in";

/** True for a well-formed address on the college domain. */
export const isCollegeEmail = (email: string): boolean =>
  /^[^@\s]+@[^@\s]+$/.test(email) && email.endsWith(COLLEGE_DOMAIN);
