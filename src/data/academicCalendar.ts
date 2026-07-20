export type CalendarEvent = {
  activity: string;
  week: string;
  duration: string;
};

export type AcademicCalendar = {
  title: string;
  events: CalendarEvent[];
};

export const academicCalendars: AcademicCalendar[] = [
  {
    title: 'Odd Semester (3rd, 5th & 7th Sem)',
    events: [
      { activity: 'Commencement of teaching', week: '1', duration: '27th July (Mon), 2026' },
      { activity: 'Last day of Payment of Semester fee', week: '2', duration: '3rd August (Mon), 2026' },
      { activity: 'Last date to submit registration form', week: '2', duration: '3rd August (Mon), 2026' },
      { activity: 'Last date to submit registration form with penalty', week: '2', duration: '7th August (Fri), 2026' },
      { activity: 'SAANJH 2026 & SPIC MACAY', week: '7', duration: '11th Sept (Fri) & 12th Sept (Sat), 2026' },
      { activity: 'Mid Semester Examinations', week: '9', duration: '21st Sept (Mon) – 28th Sept (Mon), 2026' },
      { activity: 'National Voluntary Blood Donation Day', week: '10', duration: '1st Oct (Thu), 2026' },
      { activity: 'PMST (Prakash Memorial Sports Tournament)', week: '14-15', duration: '31st Oct (Sat) – 2nd Nov (Mon), 2026' },
      { activity: 'Diwali Break for Students and Faculty', week: '-', duration: '6th Nov (Fri) to 13th Nov (Fri), 2026' },
      { activity: 'Submission of the Attendance Records', week: '17', duration: '20th Nov (Fri), 2026' },
      { activity: 'Makeup tests for Mid-Sem, End-Semester Practical Examinations & Feedback', week: '18', duration: '23rd Nov (Mon) – 28th Nov (Sat), 2026' },
      { activity: 'Last day of teaching', week: '18', duration: '27th Nov (Fri), 2026' },
      { activity: 'End-Semester Theory Examinations', week: '19-20', duration: '30th Nov (Mon) – 12th Dec (Sat), 2026' },
      { activity: 'Assessment and Display of Marks', week: '21', duration: 'Till 17th Dec (Thu), 2026' },
      { activity: 'Last date of submission of grade sheets to the Exam Section', week: '21', duration: '18th Dec (Fri), 2026' },
      { activity: 'Declaration of results', week: '22', duration: '21st Dec (Mon) – 24th Dec (Thu), 2026' },
      { activity: 'Semester Break (Vacation) for Students', week: '-', duration: '14th Dec (Mon) 2026 – 1st Jan (Fri), 2027' },
      { activity: 'Semester Break (Vacation) for Faculty', week: '-', duration: '21st Dec (Mon) 2026 – 1st Jan (Fri), 2027' },
      { activity: 'Commencement of the Even Academic Semester', week: '-', duration: '4th Jan (Mon), 2027' },
    ],
  },
  {
    title: 'B.Tech & M.Tech 1st Semester',
    events: [
      { activity: 'Induction Program', week: '-', duration: '19th Aug (Wed) – 21st Aug (Fri), 2026' },
      { activity: 'Last date to submit registration form', week: '-', duration: '19th August (Wed), 2026' },
      { activity: 'Commencement of teaching', week: '1', duration: '24th Aug (Mon), 2026' },
      { activity: 'SAANJH 2026 & SPIC MACAY', week: '3', duration: '11th Sept (Fri) & 12th Sept (Sat), 2026' },
      { activity: 'National Voluntary Blood Donation Day', week: '6', duration: '1st Oct (Thu), 2026' },
      { activity: 'Mid Semester Examinations', week: '7-8', duration: '9th Oct (Fri) – 16th Oct (Fri), 2026' },
      { activity: 'Industrial Visits', week: '8-9', duration: '17th Oct (Sat) & 24th Oct (Sat), 2026' },
      { activity: 'PMST (Prakash Memorial Sports Tournament)', week: '-', duration: '31st Oct (Sat) – 2nd Nov (Mon), 2026' },
      { activity: 'Diwali Break for Students and Faculty', week: '-', duration: '6th Nov (Fri) to 13th Nov (Fri), 2026' },
      { activity: 'Submission of the Attendance Records', week: '13', duration: '20th Nov (Fri), 2026' },
      { activity: 'Makeup tests for Mid-Sem, End-Semester Practical Examinations & Feedback', week: '14', duration: '23rd Nov (Mon) – 28th Nov (Sat), 2026' },
      { activity: 'Last day of teaching', week: '14', duration: '27th Nov (Fri), 2026' },
      { activity: 'End-Semester Theory Examinations', week: '15-16', duration: '30th Nov (Mon) – 12th Dec (Sat), 2026' },
      { activity: 'Assessment and Display of Marks', week: '17', duration: 'Till 17th Dec (Thu), 2026' },
      { activity: 'Last date of submission of grade sheets to the Exam Section', week: '17', duration: '18th Dec (Fri), 2026' },
      { activity: 'Declaration of results', week: '18', duration: '21st Dec (Mon) – 24th Dec (Thu), 2026' },
      { activity: 'Semester Break (Vacation) for Students', week: '-', duration: '14th Dec (Mon) 2026 – 1st Jan (Fri), 2027' },
      { activity: 'Semester Break (Vacation) for Faculty', week: '-', duration: '21st Dec (Mon) 2026 – 1st Jan (Fri), 2027' },
      { activity: 'Commencement of the Even Academic Semester', week: '-', duration: '4th Jan (Mon), 2027' },
    ],
  },
];