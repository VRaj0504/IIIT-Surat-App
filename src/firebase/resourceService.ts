import { collection, addDoc, query, where, orderBy, limit as fsLimit, onSnapshot, serverTimestamp, Timestamp, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db } from './firestore';
import { storage } from './storage';
import { isResourceVisibleThisYear } from '../utils/academicYear';
import { persisted } from './liveCache';

export type Resource = {
  id: string;
  title: string;
  subject: string;
  branch: string;
  semester: number;

  section?: string | null;
  type: 'Notes' | 'PYQ' | 'Slides' | 'Assignment';
  examYear?: number | null;

  academicYear?: string | null;
  fileUrl: string;
  storagePath: string;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: Timestamp | null;
};

const RESOURCES_COLLECTION = 'resources';

const FACULTY_VIEW_LIMIT = 500;

export async function uploadResource(
  localFileUri: string,
  fileName: string,
  metadata: Omit<Resource, 'id' | 'fileUrl' | 'createdAt' | 'storagePath'>
): Promise<void> {

  const fileResponse = await fetch(localFileUri);
  const fileBlob = await fileResponse.blob();

  const storagePath = `resources/${metadata.branch}/${metadata.semester}/${metadata.subject}/${Date.now()}-${fileName}`;

  const fileRef = ref(storage, storagePath);
  try {
    await uploadBytes(fileRef, fileBlob, {
      contentType: fileName.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      cacheControl: 'public,max-age=31536000,immutable',
    });
  } catch (err: any) {
    throw new Error(`Upload failed: ${err.message}`);
  }

  const fileUrl = await getDownloadURL(fileRef);

  await addDoc(collection(db, RESOURCES_COLLECTION), {
    ...metadata,
    fileUrl,
    storagePath,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToResources(
  onUpdate: (resources: Resource[]) => void,
  scope?: { branch: string; semester: number; section?: string | null },
  onError?: (error: Error) => void,
): () => void {
  const q = scope
    ? query(
        collection(db, RESOURCES_COLLECTION),
        where('branch', '==', scope.branch),
        where('semester', '==', scope.semester),
        orderBy('createdAt', 'desc'),
      )
    : query(
        collection(db, RESOURCES_COLLECTION),
        orderBy('createdAt', 'desc'),
        fsLimit(FACULTY_VIEW_LIMIT),
      );
  return persisted(`res:${scope ? JSON.stringify(scope) : 'staff'}`, (onUpdate) => onSnapshot(
    q,
    (snapshot) => {
      const all: Resource[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Resource, 'id'>),
      }));

      const viewerSection = scope?.section ?? null;
      const sectionMatched = viewerSection
        ? all.filter((r) => !r.section || r.section === viewerSection)
        : all;

      const resources = scope ? sectionMatched.filter((r) => isResourceVisibleThisYear(r)) : sectionMatched;
      onUpdate(resources);
    },

    (error) => {
      console.error('subscribeToResources failed:', scope, error);
      onError?.(error);
    },
  ), onUpdate);
}

export async function deleteResource(resource: Resource): Promise<void> {
  try {
    await deleteObject(ref(storage, resource.storagePath));
  } catch (err: any) {
    throw new Error(`Could not delete file: ${err.message}`);
  }
  await deleteDoc(doc(db, RESOURCES_COLLECTION, resource.id));
}
