import type { Resource } from '../firebase/resourceService';
import { resourceAcademicYear } from './academicYear';

// The resources library as folders: Subject -> Type -> Year -> files.
//
// This is pure data-shaping — no React, no Firestore — so the exact rules
// for what appears at each level can be tested without a phone. The
// screen just asks "what should I show at this path?" and renders the
// answer.
//
// Why folders at all: a subject accumulates 15-20 files (notes, slides,
// assignments, several years of papers). Rendered flat, five or six
// subjects of that is one endless scroll where finding "the 2024 DBMS
// paper" means scanning everything. Each level here narrows the list to
// something a glance can take in.

export type ResourceType = Resource['type'];
export type ViewMode = 'student' | 'faculty';

// Display order of the type folders inside a subject: the working
// material first, the exam papers last.
export const TYPE_ORDER: ResourceType[] = ['Notes', 'Slides', 'Assignment', 'PYQ'];

export const TYPE_LABEL: Record<ResourceType, string> = {
  Notes: 'Notes',
  Slides: 'Slides',
  Assignment: 'Assignments',
  PYQ: 'Previous Year Papers',
};

// Files whose year is unknown are kept (grouped last), never dropped —
// a paper with no year recorded is still a paper someone needs.
export const YEAR_UNSET = 'unset';
export const YEAR_UNSET_LABEL = 'Year not set';

export type FolderPath = {
  subject: string | null;
  type: ResourceType | null;
  year: string | null;
};

export const ROOT_PATH: FolderPath = { subject: null, type: null, year: null };

export type Folder = {
  key: string;
  label: string;
  count: number;
  sublabel?: string;
};

export type SubjectGroup = {
  name: string;
  code?: string;
  items: Resource[];
};

export type Level = 'subjects' | 'types' | 'years' | 'files';

export type Location = {
  level: Level;
  // The path actually being shown. Can differ from the requested path:
  // if the requested folder no longer exists (its last file was deleted,
  // or the data changed underneath), this falls back to the deepest
  // folder that still does instead of stranding the user in a blank one.
  path: FolderPath;
  // Where "back" goes; null at the top level.
  parent: FolderPath | null;
  crumbs: string[];
  folders: Folder[];
  files: Resource[];
  emptyMessage: string | null;
};

const norm = (s: string) => s.trim().toLowerCase();

// Which "year" folder a resource sits in, or null if its type has no year
// level for this viewer.
//  - PYQs are always filed by the year the exam was held.
//  - Students only ever see one cohort's Notes/Slides/Assignments (older
//    cohorts are filtered out upstream), so a year level there would be a
//    pointless single folder — those go straight to the files.
//  - Faculty see every cohort, so for them the academic year IS the
//    useful level for the non-PYQ types.
export function yearKeyOf(resource: Resource, mode: ViewMode): string | null {
  if (resource.type === 'PYQ') {
    return resource.examYear ? String(resource.examYear) : YEAR_UNSET;
  }
  if (mode === 'faculty') return resourceAcademicYear(resource) ?? YEAR_UNSET;
  return null;
}

export function yearLabel(key: string): string {
  return key === YEAR_UNSET ? YEAR_UNSET_LABEL : key;
}

// Buckets resources under subjects.
//
// Students: one folder per curriculum subject, in curriculum order —
// including subjects with nothing uploaded yet, so the structure is
// always the same shape and an empty folder reads as "not posted yet"
// rather than the subject seeming to be missing. Anything whose subject
// text matches no curriculum subject (free-typed by faculty, or from the
// email pipeline) lands in "Other" instead of vanishing.
//
// Faculty: no curriculum to anchor to, so one folder per distinct
// subject name actually present, alphabetical.
export function groupBySubject(
  resources: Resource[],
  known: { name: string; code?: string }[],
  mode: ViewMode,
): SubjectGroup[] {
  const groups: SubjectGroup[] = known.map((k) => ({ name: k.name, code: k.code, items: [] }));
  const byKey = new Map(groups.map((g) => [norm(g.name), g]));
  const other: SubjectGroup = { name: 'Other', items: [] };

  for (const r of resources) {
    const key = norm(r.subject ?? '');
    const existing = byKey.get(key);
    if (existing) {
      existing.items.push(r);
    } else if (mode === 'student') {
      other.items.push(r);
    } else {
      const created: SubjectGroup = { name: (r.subject ?? '').trim() || 'Untitled subject', items: [r] };
      byKey.set(key, created);
      groups.push(created);
    }
  }

  if (mode === 'faculty') groups.sort((a, b) => a.name.localeCompare(b.name));
  if (other.items.length > 0) groups.push(other);
  return groups;
}

export function listTypeFolders(items: Resource[]): Folder[] {
  return TYPE_ORDER.map((type) => ({
    key: type,
    label: TYPE_LABEL[type],
    count: items.filter((r) => r.type === type).length,
  })).filter((f) => f.count > 0);
}

// The year folders inside one type, or null when that type has no year
// level (so the caller goes straight to the files).
export function listYearFolders(items: Resource[], type: ResourceType, mode: ViewMode): Folder[] | null {
  const ofType = items.filter((r) => r.type === type);
  const counts = new Map<string, number>();
  for (const r of ofType) {
    const key = yearKeyOf(r, mode);
    if (key === null) return null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  const keys = Array.from(counts.keys()).sort((a, b) => {
    if (a === YEAR_UNSET) return 1; // undated always last
    if (b === YEAR_UNSET) return -1;
    return b.localeCompare(a, undefined, { numeric: true }); // newest first
  });
  return keys.map((key) => ({ key, label: yearLabel(key), count: counts.get(key)! }));
}

function createdSeconds(r: Resource): number {
  // A null createdAt is a write whose server timestamp hasn't resolved
  // yet — i.e. the newest thing there is — so it sorts as newest.
  return r.createdAt?.seconds ?? Number.MAX_SAFE_INTEGER;
}

export function listFiles(items: Resource[], type: ResourceType, year: string | null, mode: ViewMode): Resource[] {
  let files = items.filter((r) => r.type === type);
  if (year !== null) files = files.filter((r) => yearKeyOf(r, mode) === year);
  // Notes and slides: newest upload first, since the latest is usually
  // what someone wants. Assignments and papers are a numbered/named set
  // ("Assignment 2" before "Assignment 10"), so natural title order.
  if (type === 'Notes' || type === 'Slides') {
    return [...files].sort((a, b) => createdSeconds(b) - createdSeconds(a));
  }
  return [...files].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
}

const pluralFiles = (n: number) => `${n} file${n === 1 ? '' : 's'}`;
export const countLabel = (n: number) => (n === 0 ? 'No files yet' : pluralFiles(n));

// The single question the screen asks: "given this path, what do I show?"
export function describeLocation(requested: FolderPath, groups: SubjectGroup[], mode: ViewMode): Location {
  const atRoot: Location = {
    level: 'subjects',
    path: ROOT_PATH,
    parent: null,
    crumbs: [],
    folders: groups.map((g) => ({
      key: g.name,
      label: g.name,
      sublabel: g.code,
      count: g.items.length,
    })),
    files: [],
    emptyMessage: groups.length === 0 ? 'Nothing here yet.' : null,
  };

  const group = requested.subject ? groups.find((g) => g.name === requested.subject) : undefined;
  if (!group) return atRoot;

  const subjectPath: FolderPath = { subject: group.name, type: null, year: null };
  const typeFolders = listTypeFolders(group.items);
  const type = requested.type && typeFolders.some((f) => f.key === requested.type) ? requested.type : null;

  if (!type) {
    return {
      level: 'types',
      path: subjectPath,
      parent: ROOT_PATH,
      crumbs: [group.name],
      folders: typeFolders,
      files: [],
      emptyMessage: typeFolders.length === 0 ? 'Nothing has been posted for this subject yet.' : null,
    };
  }

  const typePath: FolderPath = { subject: group.name, type, year: null };
  const yearFolders = listYearFolders(group.items, type, mode);

  // No year level for this type: straight to the files.
  if (yearFolders === null) {
    return {
      level: 'files',
      path: typePath,
      parent: subjectPath,
      crumbs: [group.name, TYPE_LABEL[type]],
      folders: [],
      files: listFiles(group.items, type, null, mode),
      emptyMessage: null,
    };
  }

  const year = requested.year && yearFolders.some((f) => f.key === requested.year) ? requested.year : null;

  if (!year) {
    return {
      level: 'years',
      path: typePath,
      parent: subjectPath,
      crumbs: [group.name, TYPE_LABEL[type]],
      folders: yearFolders,
      files: [],
      emptyMessage: null,
    };
  }

  return {
    level: 'files',
    path: { subject: group.name, type, year },
    parent: typePath,
    crumbs: [group.name, TYPE_LABEL[type], yearLabel(year)],
    folders: [],
    files: listFiles(group.items, type, year, mode),
    emptyMessage: null,
  };
}
