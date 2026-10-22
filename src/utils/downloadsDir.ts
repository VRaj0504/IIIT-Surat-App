import { Directory, File, Paths } from "expo-file-system";

export function getDownloadsDir(): Directory {
  const dir = new Directory(Paths.document, "downloads");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

const DOCUMENT_EXT = /\.(pdf|png|jpe?g|gif|webp|docx?|pptx?|xlsx?|csv|txt|zip)$/i;

export function migrateOldDownloads(): void {
  const dir = getDownloadsDir();
  for (const entry of Paths.document.list()) {
    if (!(entry instanceof File)) continue;
    if (!DOCUMENT_EXT.test(entry.name)) continue;
    try {
      entry.move(dir);
    } catch {}
  }
}
