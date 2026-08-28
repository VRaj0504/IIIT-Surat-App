import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db } from "./firestore";
import { storage } from "./storage";

export type LostFoundType = "lost" | "found";
export type LostFoundCategory =
  | "Electronics"
  | "Documents/ID Cards"
  | "Accessories"
  | "Books/Notes"
  | "Clothing"
  | "Other";

export type LostFoundItem = {
  id: string;
  type: LostFoundType;
  title: string;
  description: string;
  category: LostFoundCategory;
  location: string;
  photoUrl: string | null;
  storagePath: string | null;
  postedBy: string;
  postedByName: string;
  // Contact is the poster's own institute email, not a manually-typed phone
  // number — it's already verified (signup is gated to @iiitsurat.ac.in,
  // see AuthContext.ts) and doesn't add a new place to store personal phone
  // numbers just for this one feature.
  postedByEmail: string;
  status: "open" | "resolved";
  createdAt: Timestamp | null;
  resolvedAt: Timestamp | null;
};

const COLLECTION = "lostFoundItems";

export async function postLostFoundItem(params: {
  type: LostFoundType;
  title: string;
  description: string;
  category: LostFoundCategory;
  location: string;
  postedBy: string;
  postedByName: string;
  postedByEmail: string;
  // Local file URI from the image picker — optional. Posting works fine
  // without one; Storage just isn't live until the project is on Blaze
  // (see src/firebase/storage.ts), at which point this starts working
  // with no other code changes needed.
  localPhotoUri?: string | null;
}): Promise<void> {
  let photoUrl: string | null = null;
  let storagePath: string | null = null;

  if (params.localPhotoUri) {
    const fileResponse = await fetch(params.localPhotoUri);
    const fileBytes = await fileResponse.arrayBuffer();
    storagePath = `lostFound/${params.postedBy}/${Date.now()}.jpg`;
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, fileBytes, {
      contentType: "image/jpeg",
      cacheControl: "public,max-age=31536000,immutable",
    });
    photoUrl = await getDownloadURL(fileRef);
  }

  await addDoc(collection(db, COLLECTION), {
    type: params.type,
    title: params.title.trim(),
    description: params.description.trim(),
    category: params.category,
    location: params.location.trim(),
    photoUrl,
    storagePath,
    postedBy: params.postedBy,
    postedByName: params.postedByName,
    postedByEmail: params.postedByEmail,
    status: "open",
    createdAt: serverTimestamp(),
    resolvedAt: null,
  });
}

// Live feed, newest first. Pass `type` to show only Lost or only Found —
// the screen uses a segmented toggle rather than mixing both in one list.
export function subscribeToLostFoundItems(
  type: LostFoundType,
  onUpdate: (items: LostFoundItem[]) => void,
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where("type", "==", type),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items: LostFoundItem[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<LostFoundItem, "id">),
      }));
      onUpdate(items);
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[lostFoundService] subscribeToLostFoundItems error:", err);
    },
  );
}

// Only the original poster can resolve their own post (see firestore.rules).
export async function resolveLostFoundItem(itemId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, itemId), {
    status: "resolved",
    resolvedAt: serverTimestamp(),
  });
}

export async function deleteLostFoundItem(item: LostFoundItem): Promise<void> {
  if (item.storagePath) {
    try {
      await deleteObject(ref(storage, item.storagePath));
    } catch (err: any) {
      // If Storage isn't live yet (pre-Blaze) or the file's already gone,
      // don't let that block removing the Firestore doc itself.
      // eslint-disable-next-line no-console
      console.warn("[lostFoundService] could not delete photo:", err?.message);
    }
  }
  await deleteDoc(doc(db, COLLECTION, item.id));
}
