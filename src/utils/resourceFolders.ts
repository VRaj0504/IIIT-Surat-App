import type { Resource } from '../firebase/resourceService';
import { resourceAcademicYear } from './academicYear';

export type ResourceType = Resource['type'];
export type ViewMode = 'student' | 'faculty';

export const TYPE_ORDER: ResourceType[] = ['Notes', 'Slides', 'Assignment', 'PYQ'];

export const TYPE_LABEL: Record<ResourceType, string> = {
  Notes: 'Notes',
  Slides: 'Slides',
  Assignment: 'Assignments',
  PYQ: 'Previous Year Papers',
};

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

  path: FolderPath;

  parent: FolderPath | null;
  crumbs: string[];
  folders: Folder[];
  files: Resource[];
  emptyMessage: string | null;
};

const norm = (s: string) => s.trim().toLowerCase();

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
    if (a === YEAR_UNSET) return 1;
    if (b === YEAR_UNSET) return -1;
    return b.localeCompare(a, undefined, { numeric: true });
  });
  return keys.map((key) => ({ key, label: yearLabel(key), count: counts.get(key)! }));
}

function createdSeconds(r: Resource): number {

  return r.createdAt?.seconds ?? Number.MAX_SAFE_INTEGER;
}

export function listFiles(items: Resource[], type: ResourceType, year: string | null, mode: ViewMode): Resource[] {
  let files = items.filter((r) => r.type === type);
  if (year !== null) files = files.filter((r) => yearKeyOf(r, mode) === year);

  if (type === 'Notes' || type === 'Slides') {
    return [...files].sort((a, b) => createdSeconds(b) - createdSeconds(a));
  }
  return [...files].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
}

const pluralFiles = (n: number) => `${n} file${n === 1 ? '' : 's'}`;
export const countLabel = (n: number) => (n === 0 ? 'No files yet' : pluralFiles(n));

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
