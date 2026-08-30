import { ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { storage } from "./storage";
import { functions } from "./functionsClient";

export type PosterExtraction = {
  rawText: string;
  guessedTitle: string | null;
  guessedDate: string | null; // "YYYY-MM-DD"
  guessedTime: string | null; // "HH:mm"
};

const BUCKET = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET as string;

// Uploads the poster photo, runs OCR via the extractPosterInfo Cloud
// Function, and returns whatever it could extract. This is always a
// best-effort guess — the caller (ScanPosterScreen) shows every field on
// a confirm/edit screen before anything actually gets added to the
// device calendar; nothing here is trusted blindly.
export async function scanPoster(localUri: string, uid: string): Promise<PosterExtraction> {
  const storagePath = `posterScans/${uid}/${Date.now()}.jpg`;
  const fileRef = ref(storage, storagePath);

  // .blob(), not .arrayBuffer() — the same React Native Blob-construction
  // issue we hit with Lost & Found and Resources uploads applies here too.
  const response = await fetch(localUri);
  const blob = await response.blob();
  await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });

  const extractPosterInfo = httpsCallable<
    { storagePath: string; bucket: string },
    PosterExtraction
  >(functions, "extractPosterInfo");

  const result = await extractPosterInfo({ storagePath, bucket: BUCKET });
  return result.data;
}
