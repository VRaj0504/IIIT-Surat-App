import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, Timestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firestore';
import { supabase } from '../supabaseClient';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';


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

// Uploads a file to Supabase Storage, then saves its metadata to Firestore.
// "localFileUri" is the path to the file ON THE PHONE (before upload) —
// this comes from a file picker (wired up in the faculty screen).
export async function uploadResource(
  localFileUri: string,
  fileName: string,
  metadata: Omit<Resource, 'id' | 'fileUrl' | 'createdAt' | 'storagePath'>
): Promise<void> {
  // 1. Read the file from the phone's storage as a base64 string.
  //    Files on a phone aren't directly "readable" by JS — we have to
  //    explicitly read their bytes first.
  const base64 = await FileSystem.readAsStringAsync(localFileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // 2. Convert that base64 string into raw bytes (ArrayBuffer) — this is
  //    the format Supabase's upload function actually expects.
  const fileBytes = decode(base64);

  // 3. Build a unique path inside the bucket, e.g.
  //    CSE/3/Data Structures/1737000000-notes.pdf
  const storagePath = `${metadata.branch}/${metadata.semester}/${metadata.subject}/${Date.now()}-${fileName}`;

  // 4. Actually upload the bytes to the "resources" bucket we created.
  const { error: uploadError } = await supabase.storage
    .from('resources')
    .upload(storagePath, fileBytes, {
      contentType: fileName.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  // 5. Get the public URL for the file we just uploaded — this is what
  //    students will actually open/download later.
  const { data: urlData } = supabase.storage.from('resources').getPublicUrl(storagePath);

  // 6. Save the metadata (NOT the file itself) into Firestore, including
  //    the public URL we just got.
  await addDoc(collection(db, RESOURCES_COLLECTION), {
    ...metadata,
    fileUrl: urlData.publicUrl,
    storagePath,
    createdAt: serverTimestamp(),
  });
}

// Live-listens for all resources, ordered newest first — same pattern
// as subscribeToNotices/subscribeToPlacementData from before.
export function subscribeToResources(onUpdate: (resources: Resource[]) => void): () => void {
  const q = query(collection(db, RESOURCES_COLLECTION), orderBy('createdAt', 'desc'));
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
