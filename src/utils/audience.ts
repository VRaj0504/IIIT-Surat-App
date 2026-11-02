const squash = (s: unknown) => String(s ?? '').toUpperCase().replace(/[\s_\-.]+/g, '');

export function normSection(branch: unknown, section: unknown): string {
  const b = squash(branch);
  let x = squash(section).replace(/^(SECTION|SEC)/, '');
  if (b && x.startsWith(b)) x = x.slice(b.length);
  return x;
}

export type Viewer = { branch?: string | null; section?: string | null; admissionYear?: number | null; specialization?: string | null } | null | undefined;

export function isForViewer(
  t: { targetBranch?: string | null; targetSection?: string | null; targetAdmissionYear?: number | null; targetSpecialization?: string | null },
  v: Viewer,
): boolean {
  if (t.targetBranch && squash(t.targetBranch) !== squash(v?.branch)) return false;
  if (t.targetSection && normSection(v?.branch, t.targetSection) !== normSection(v?.branch, v?.section)) return false;
  if (t.targetAdmissionYear && Number(t.targetAdmissionYear) !== Number(v?.admissionYear)) return false;
  if (t.targetSpecialization && squash(t.targetSpecialization) !== squash(v?.specialization)) return false;
  return true;
}
