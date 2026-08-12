import { collection, addDoc, query, where, orderBy, limit as fsLimit, onSnapshot, serverTimestamp, Timestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firestore';
import { supabase } from '../supabaseClient';


// This is the "shape" of one resource's metadata, stored in Firestore.
// Note: this does NOT include the actual file bytes — just information
// ABOUT the file, plus a URL pointing to where the real file lives
// (in Supabase Storage). Using Supabase for files (not Firebase Storage)
// because Firebase Storage requires the Blaze billing plan; Supabase's
// free tier needs no card on file.
export type Resource = {
  id: string;
  title: string;
  subject: string;
  branch: string;      // e.g. 'CSE', 'ECE', 'MnC'
  semester: number;         // e.g. 1 to 8
  type: 'Notes' | 'PYQ' | 'Slides';
  fileUrl: string;      // public URL from Supabase Storage
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

// Uploads a file to Supabase Storage, then saves its metadata to Firestore.
// "localFileUri" is the path to the file ON THE PHONE (before upload) —
// this comes from a file picker (wired up in the faculty screen).
export async function uploadResource(
  localFileUri: string,
  fileName: string,
  metadata: Omit<Resource, 'id' | 'fileUrl' | 'createdAt' | 'storagePath'>
): Promise<void> {
  // Read the file straight into an ArrayBuffer via fetch(), rather than
  // reading it as a base64 STRING first (FileSystem.readAsStringAsync) and
  // then decoding that back into bytes. Base64 text is ~33% larger than
  // the file's real byte size, so the old two-step path held two full
  // copies of an inflated file in memory at once — real risk of a slideshow
  // or scan-heavy PDF upload running a low-end phone out of memory, and
  // needless latency for every faculty upload regardless of device.
  // fetch(uri).arrayBuffer() gives Supabase the raw bytes directly.
  const fileResponse = await fetch(localFileUri);
  const fileBytes = await fileResponse.arrayBuffer();

  // Build a unique path inside the bucket, e.g.
  // CSE/3/Data Structures/1737000000-notes.pdf
  const storagePath = `${metadata.branch}/${metadata.semester}/${metadata.subject}/${Date.now()}-${fileName}`;

  // Upload the bytes to the "resources" bucket. cacheControl tells
  // Supabase's CDN to cache this file for a year — safe because
  // storagePath already embeds Date.now(), so a given path's content
  // never changes; a new upload always gets a new path. Without this,
  // every one of hundreds of students opening the same shared PDF re-pulls
  // it from origin storage instead of a cached edge copy, which is exactly
  // the kind of repeat load that burns through a free-tier bandwidth cap
  // fastest during exam-week PYQ downloads.
  const { error: uploadError } = await supabase.storage
    .from('resources')
    .upload(storagePath, fileBytes, {
      contentType: fileName.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      cacheControl: '31536000',
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  // Get the public URL for the file we just uploaded — this is what
  // students will actually open/download later.
  const { data: urlData } = supabase.storage.from('resources').getPublicUrl(storagePath);

  // Save the metadata (NOT the file itself) into Firestore, including
  // the public URL we just got.
  await addDoc(collection(db, RESOURCES_COLLECTION), {
    ...metadata,
    fileUrl: urlData.publicUrl,
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
  const { error } = await supabase.storage.from('resources').remove([resource.storagePath]);
  if (error) {
    throw new Error(`Could not delete file: ${error.message}`);
  }
  await deleteDoc(doc(db, RESOURCES_COLLECTION, resource.id));
}
