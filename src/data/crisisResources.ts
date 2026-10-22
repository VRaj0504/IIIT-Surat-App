

export type CrisisResource = {
  name: string;
  description: string;
  phone: string;
};

export const NATIONAL_HELPLINES: CrisisResource[] = [
  {
    name: "Medical Emergency (Ambulance)",
    description: "Any physical emergency, anywhere in India",
    phone: "108",
  },
  {
    name: "Tele-MANAS Mental Health Helpline",
    description: "Govt. of India, toll-free, 24/7, about 20 languages",
    phone: "14416",
  },
  {
    name: "iCall (TISS)",
    description: "Free, confidential counselling by phone or email",
    phone: "9152987821",
  },
];

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

export const EXTERNAL_SUPPORT: LinkResource[] = [
  {
    name: "YourDOST",
    description: "Independent platform, not run by the institute — chat or book a session with a counsellor",
    url: "https://yourdost.com",
  },
];
