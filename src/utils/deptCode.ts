// Turns any way a department or branch is written ("Computer Science and Engineering",
// "CSE", "ug cse", "Mathematics & Computing") into one short code so matching works.
const RULES: [RegExp, string][] = [
  [/\b(MNC|MCS|MATHEMATICS)\b|MATH(S)?\s*(&|AND)\s*COMPUT/i, "MNC"],
  [/\b(CSE|CS)\b|COMPUTER\s*SCIENCE/i, "CSE"],
  [/\b(ECE|EC)\b|ELECTRONICS/i, "ECE"],
  [/\b(ASH|AS)\b|APPLIED\s*SCIENCE/i, "AS"],
  [/\b(HSS|HS)\b|HUMANITIES/i, "HSS"],
];

export function deptCode(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const squashed = s.toUpperCase().replace(/^UG|^PG/, "").replace(/[^A-Z]/g, "");
  if (["CSE", "ECE", "MNC", "AS", "HSS"].includes(squashed)) return squashed;
  for (const [re, code] of RULES) if (re.test(s)) return code;
  return squashed;
}

/** HOD department that a student of this branch reports to. MNC is run by the CSE department unless a separate MNC HOD exists. */
export function hodFor<T extends { department: string }>(hods: T[], branch: string | null | undefined): T | null {
  const b = deptCode(branch);
  if (!b) return null;
  return hods.find((h) => deptCode(h.department) === b) ?? (b === "MNC" ? hods.find((h) => deptCode(h.department) === "CSE") ?? null : null);
}
