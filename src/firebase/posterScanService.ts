import { ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { storage } from "./storage";
import { functions } from "./functionsClient";
import { imageBlob } from "../utils/compressImage";

export type PosterExtraction = {
  rawText: string;
  guessedTitle: string | null;
  guessedDate: string | null;
  guessedTime: string | null;
};

const BUCKET = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET as string;

export async function scanPoster(localUri: string, uid: string): Promise<PosterExtraction> {
  const storagePath = `posterScans/${uid}/${Date.now()}.jpg`;
  const fileRef = ref(storage, storagePath);

  const blob = await imageBlob(localUri, 2000);
  await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });

  const extractPosterInfo = httpsCallable<
    { storagePath: string; bucket: string },
    PosterExtraction
  >(functions, "extractPosterInfo");

  const result = await extractPosterInfo({ storagePath, bucket: BUCKET });
  return result.data;
}
