// Crisis resources shown on CounsellingScreen, always visible, never
// gated behind the request form. Kept in their own tiny file so
// there's exactly one obvious place to fix a number.
//
// !! PLACEHOLDER !! CAMPUS_CONTACT below is not real yet — replace name
// and phone with the actual IIIT Surat Wellness Centre / warden-on-duty
// contact before this ships. Everything else here (KIRAN, iCall) is a
// real, national, government/established helpline as of this writing —
// double-check both numbers are still current before relying on them,
// since helpline numbers do occasionally change.
export type CrisisResource = {
  name: string;
  description: string;
  phone: string; // digits only, used to build a tel: link
};

export const NATIONAL_HELPLINES: CrisisResource[] = [
  {
    name: "Medical Emergency (Ambulance)",
    description: "Any physical emergency, anywhere in India",
    phone: "108",
  },
  {
    name: "KIRAN Mental Health Helpline",
    description: "Govt. of India, toll-free, 24/7, multilingual",
    phone: "18005990019",
  },
  {
    name: "iCall (TISS)",
    description: "Free, confidential counselling by phone or email",
    phone: "9152987821",
  },
];

// Real campus contact, from the Health Issue Escalation & Management
// page, iiitsurat.ac.in (captured 2026-09-24) — the Medical Officer,
// not a dedicated counsellor (IIIT Surat doesn't have one listed there
// yet). Real and reachable is still far better than a placeholder;
// swap this out the moment a real counselling-specific contact exists.
export const CAMPUS_CONTACT: CrisisResource = {
  name: "IIIT Surat Medical Officer (Dr. Paresh Chhotala)",
  description: "For anything urgent on campus — not counselling-specific, but real and reachable",
  phone: "9824270476",
};

export type LinkResource = {
  name: string;
  description: string;
  url: string;
};

// YourDOST is a real, independent platform (not run by IIIT Surat) that
// some students on campus already use — some colleges have a paid
// partnership with them that unlocks free sessions through a special
// institute link/code; without confirming IIIT Surat has one, this
// points at their general public site rather than assuming access
// that may not exist. If the institute does have a partnership URL or
// code, swap it in here.
export const EXTERNAL_SUPPORT: LinkResource[] = [
  {
    name: "YourDOST",
    description: "Independent platform, not run by the institute — chat or book a session with a counsellor",
    url: "https://yourdost.com",
  },
];
