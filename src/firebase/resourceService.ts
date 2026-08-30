import { collection, addDoc, query, where, orderBy, limit as fsLimit, onSnapshot, serverTimestamp, Timestamp, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db } from './firestore';
import { storage } from './storage';

// This is the "shape" of one resource's metadata, stored in Firestore.
// Note: this does NOT include the actual file bytes — just information
// ABOUT the file, plus a URL pointing to where the real file lives (in
// Firebase Storage, now that the project is on the Blaze plan).
export type Resource = {
  id: string;
  title: string;
  subject: string;
  branch: string;      // e.g. 'CSE', 'ECE', 'MnC'
  semester: number;         // e.g. 1 to 8
  type: 'Notes' | 'PYQ' | 'Slides';
  fileUrl: string;      // download URL from Firebase Storage
  storagePath: string;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: Timestamp | null;
};

const RESOURCES_COLLECTION = 'resources';
// How many resources a single "everything" (faculty) subscription pulls at
// once. That view is for a handful of faculty accounts total, so this is
// generous headroom, not a tight cap — it exists only so the collection
// growing over years of semesters can't eventually make that one query
// read (and re-read on every live update) thousands of docs at once.
const FACULTY_VIEW_LIMIT = 500;

// Uploads a file to Firebase Storage, then saves its metadata to Firestore.
// "localFileUri" is the path to the file ON THE PHONE (before upload) —
// this comes from a file picker (wired up in the faculty screen).
export async function uploadResource(
  localFileUri: string,
  fileName: string,
  metadata: Omit<Resource, 'id' | 'fileUrl' | 'createdAt' | 'storagePath'>
): Promise<void> {
  // Read the file via fetch(uri).blob() rather than reading it as a
  // base64 STRING first (FileSystem.readAsStringAsync) and decoding that
  // back into bytes — base64 text is ~33% larger than the file's real
  // byte size, so that two-step path held two full copies of an inflated
  // file in memory at once, a real risk of running a low-end phone out
  // of memory on a slideshow or scan-heavy PDF, plus needless latency for
  // every faculty upload regardless of device.
  //
  // Specifically .blob(), NOT .arrayBuffer(): Firebase's SDK internally
  // tries to wrap raw bytes into a Blob before uploading, and React
  // Native's Blob implementation can't construct one from an ArrayBuffer
  // (throws "Creating blobs from 'ArrayBuffer'... not supported" on
  // upload, even though the exact same code works fine on web). Getting a
  // real Blob straight from the fetch response sidesteps that internal
  // conversion entirely, with the same one-copy memory efficiency as the
  // ArrayBuffer approach would have had if RN supported it.
  const fileResponse = await fetch(localFileUri);
  const fileBlob = await fileResponse.blob();

  // Build a unique path inside the bucket, e.g.
  // resources/CSE/3/Data Structures/1737000000-notes.pdf
  const storagePath = `resources/${metadata.branch}/${metadata.semester}/${metadata.subject}/${Date.now()}-${fileName}`;

  // Upload the bytes, with a long cacheControl — safe because storagePath
  // already embeds Date.now(), so a given path's content never changes; a
  // new upload always gets a new path. Without this, every one of hundreds
  // of students opening the same shared PDF re-pulls it from origin
  // storage instead of a cached edge copy, which is exactly the kind of
  // repeat load that costs the most bandwidth during exam-week PYQ
  // download spikes.
  const fileRef = ref(storage, storagePath);
  try {
    await uploadBytes(fileRef, fileBlob, {
      contentType: fileName.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      cacheControl: 'public,max-age=31536000,immutable',
    });
  } catch (err: any) {
    throw new Error(`Upload failed: ${err.message}`);
  }

  // Get the download URL for the file we just uploaded — this is what
  // students will actually open/download later. Firebase's download URLs
  // carry their own access token, so they work for anyone with the link
  // regardless of the caller's auth state, same as Supabase's public URL did.
  const fileUrl = await getDownloadURL(fileRef);

  // Save the metadata (NOT the file itself) into Firestore, including
  // the download URL we just got.
  await addDoc(collection(db, RESOURCES_COLLECTION), {
    ...metadata,
    fileUrl,
    storagePath,
    createdAt: serverTimestamp(),
  });
}

// Live-listens for resources, ordered newest first.
//
// Pass `scope` to restrict this to one branch+semester — what every
// student view actually needs (see ResourcesScreen.tsx), instead of
// syncing the whole college's resource library to every single student's
// phone and filtering client-side. That mattered increasingly little when
// this was a few dozen files; at thousands of concurrent students each
// holding a live listener open, and years of accumulated notes/PYQs/slides,
// an unscoped listener means every new upload anywhere re-syncs the full
// collection to every connected phone.
//
// Omit `scope` for the faculty "everything, across all subjects" view
// (small, privileged audience) — that path keeps the previous behavior,
// just with FACULTY_VIEW_LIMIT as a growth safety net.
export function subscribeToResources(
  onUpdate: (resources: Resource[]) => void,
  scope?: { branch: string; semester: number },
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
  return onSnapshot(q, (snapshot) => {
    const resources: Resource[] = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<Resource, 'id'>),
    }));
    onUpdate(resources);
  });
}

/// deleting the slides of resources function

export async function deleteResource(resource: Resource): Promise<void> {
  try {
    await deleteObject(ref(storage, resource.storagePath));
  } catch (err: any) {
    throw new Error(`Could not delete file: ${err.message}`);
  }
  await deleteDoc(doc(db, RESOURCES_COLLECTION, resource.id));
}
