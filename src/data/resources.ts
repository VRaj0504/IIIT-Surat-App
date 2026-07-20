export type ResourceType = 'Notes' | 'PYQ' | 'Slides' | 'Reference';

export type ResourceItem = {
  title: string;
  type: ResourceType;
  url: string;
};

export type SubjectResources = {
  subject: string;
  items: ResourceItem[];
};

export const resources: SubjectResources[] = [
  {
    subject: 'Data Structures',
    items: [
      { title: 'Unit 1-3 Notes', type: 'Notes', url: 'https://drive.google.com/' },
      { title: '2025 Mid-Sem PYQ', type: 'PYQ', url: 'https://drive.google.com/' },
      { title: 'Lecture Slides', type: 'Slides', url: 'https://drive.google.com/' },
    ],
  },
  {
    subject: 'Discrete Mathematics',
    items: [
      { title: 'Group Theory Notes', type: 'Notes', url: 'https://drive.google.com/' },
      { title: '2025 End-Sem PYQ', type: 'PYQ', url: 'https://drive.google.com/' },
    ],
  },
  {
    subject: 'Computer Organization',
    items: [
      { title: 'Digital Logic Notes', type: 'Notes', url: 'https://drive.google.com/' },
    ],
  },
  {
    subject: 'Probability & Statistics',
    items: [
      { title: 'Dr. A.P. Singh Course Notes', type: 'Notes', url: 'https://drive.google.com/' },
      { title: '2025 PYQ', type: 'PYQ', url: 'https://drive.google.com/' },
    ],
  },
];