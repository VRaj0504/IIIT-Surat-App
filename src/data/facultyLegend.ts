// Maps the faculty initials printed on the official timetable PDFs to full
// names for display. Fill in real names as you confirm them — anything not
// in this map is shown as-is (the initials), so missing entries degrade
// gracefully instead of breaking the screen.
//
// Initials seen so far in scripts/seed-timetable.mjs: RRP, TG, RN, DN, PJM,
// MR, HS-F1, HS-F2, plus teaching-assistant codes like PG25CS07 (left
// unexpanded on purpose — TA names change too often to hardcode).
const FACULTY_LEGEND: Record<string, string> = {
  // 'RRP': 'Full Name Here',
"K.D.": "Kaustubh Dhondge",
"R.K.": "Ritesh Kumar",
"RRP": "Reema Patel",
"P.S.": "Pradeep Singh",
"R.N": "Rachit Nimavat",
"D.N": "Nidhi Desai",
"PJM": "Prathana Jagat Mehta",
"N B" : " Nayan Behra",
"A.D" : "Abisek Dahal",
"D.R." : "Diksha Rangwani",
"T.G." : "Trupti Gondaliya",
"K.Y." : "Khamosh Yadav",
"SS": "Sudeep Sharma",
"SVR" : "Sivavenkateswara Rao V.",
"VAP" : "Venkata Annapura Chavali",
"H.G." : "Hemant Goklani",
"T.D." : "Tanmay Dubey",
"S.M." : "Shikha Murya",
"L.C." : "Lokendra Chaouhan",
"AN" : "Neelima Agarwal",
"MR" : "Manish Rai",
"DP" :" Dhiraj K. Patel",
"RM" : "Rahul D. Mishra",
"RK" : "Rahul K Patel",
"SR" : " Sejal K Rathod",
"AT" :"Anandatheertan Srinivasan",
"BP" : " Bikas Patra",
"ND" : "Nishad Deshpande",
"APS" : "Anand Pratap Singh",
"AP" : "Arti Patel",
"VP" : "Vijay K Patel"
};

export function expandFaculty(faculty: string): string {
  return faculty
    .split('/')
    .map((part) => FACULTY_LEGEND[part.trim()] ?? part.trim())
    .join(' / ');
}
