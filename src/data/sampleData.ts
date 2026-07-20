// Placeholder/sample data. We'll replace this with Firebase-backed data
// once the backend is wired up — for now it lets every screen render real content.

export type ClassSlot = {
  id: string;
  subject: string;
  faculty: string;
  room: string;
  startTime: string;
  endTime: string;
};

export type DaySchedule = {
  day: string;
  slots: ClassSlot[];
};

export const timetable: DaySchedule[] = [
  {
    day: 'Monday',
    slots: [
      { id: 'm1', subject: 'Data Structures', faculty: 'Dr. Sharma', room: 'LT-1', startTime: '9:00', endTime: '10:00' },
      { id: 'm2', subject: 'Discrete Mathematics', faculty: 'Dr. Verma', room: 'LT-2', startTime: '10:00', endTime: '11:00' },
      { id: 'm3', subject: 'Digital Electronics Lab', faculty: 'Prof. Rao', room: 'Lab-3', startTime: '2:00', endTime: '4:00' },
    ],
  },
  {
    day: 'Tuesday',
    slots: [
      { id: 't1', subject: 'Probability & Statistics', faculty: 'Dr. Iyer', room: 'LT-1', startTime: '9:00', endTime: '10:00' },
      { id: 't2', subject: 'DSA Lab', faculty: 'Dr. Sharma', room: 'Lab-1', startTime: '11:00', endTime: '1:00' },
    ],
  },
  {
    day: 'Wednesday',
    slots: [
      { id: 'w1', subject: 'Computer Organization', faculty: 'Dr. Patel', room: 'LT-3', startTime: '9:00', endTime: '10:00' },
      { id: 'w2', subject: 'Discrete Mathematics', faculty: 'Dr. Verma', room: 'LT-2', startTime: '10:00', endTime: '11:00' },
    ],
  },
];

export type Notice = {
  id: string;
  title: string;
  description: string;
  category: 'Academic' | 'Placement' | 'Event' | 'General';
  date: string;
};

export const notices: Notice[] = [
  {
    id: 'n1',
    title: 'Mid-Sem Exam Schedule Released',
    description: 'Mid-semester exams begin from next Monday. Check the academic portal for the detailed timetable.',
    category: 'Academic',
    date: '5 Jul',
  },
  {
    id: 'n2',
    title: 'LCS Coding Club: Contest Prep Session',
    description: 'Join this Saturday for a Codeforces Div 2 prep session led by senior members.',
    category: 'Event',
    date: '4 Jul',
  },
  {
    id: 'n3',
    title: 'Summer Internship Drive — Registrations Open',
    description: 'Companies visiting for summer internships next month. Register on the placement portal.',
    category: 'Placement',
    date: '3 Jul',
  },
];

export const subjects: string[] = Array.from(
  new Set(timetable.flatMap((day) => day.slots.map((slot) => slot.subject)))
);

export type Club = {
  id: string;
  name: string;
  category: string;
  description: string;
  members: number;
};

export const clubs: Club[] = [
  { id: 'c1', name: 'LCS (Learn Code Solve)', category: 'Technical', description: 'Competitive programming and DSA community.', members: 120 },
  { id: 'c2', name: 'Robotics Club', category: 'Technical', description: 'Build and compete with autonomous robots.', members: 80 },
  { id: 'c3', name: 'Music Club', category: 'Cultural', description: 'Jam sessions, performances, and open mics.', members: 60 },
  { id: 'c4', name: 'Sports Committee', category: 'Sports', description: 'Organizes intramural and inter-college tournaments.', members: 150 },
];
