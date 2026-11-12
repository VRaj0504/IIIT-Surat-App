// Everything that is specific to one college lives here.
// To set the app up for another college, change these values (and the same domain in firestore.rules
// and functions/src/college.ts).
export const COLLEGE = {
  /** Sign-in is limited to this email domain. Keep the leading "@". */
  emailDomain: '@iiitsurat.ac.in',
  /** Where the student web app is hosted. No trailing slash. */
  webBaseUrl: 'https://collegego-iiitsurat.web.app',
  /** File name of the medical leave form inside public/forms. */
  medicalFormFile: 'IIITS-Medical-Leave-Form.pdf',
} as const;

export const COLLEGE_EMAIL_DOMAIN = COLLEGE.emailDomain;
export const PRIVACY_POLICY_URL = `${COLLEGE.webBaseUrl}/privacy.html`;
export const COMMUNITY_GUIDELINES_URL = `${COLLEGE.webBaseUrl}/community.html`;
export const MEDICAL_FORM_URL = `${COLLEGE.webBaseUrl}/forms/${COLLEGE.medicalFormFile}`;
