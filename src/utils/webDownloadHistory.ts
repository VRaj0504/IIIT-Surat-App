import AsyncStorage from "@react-native-async-storage/async-storage";

// The web build can't save files into a private folder the way the phone
// build does (see handleDownload in ResourcesScreen.tsx — on web the
// "download" is just window.open), so there's no folder for
// MyDownloadsScreen to list. This keeps a small record of what was
// opened instead, in the browser's own storage (AsyncStorage maps to
// localStorage on web): enough to show "recently opened" later without
// pretending a file was saved.
export type WebDownloadEntry = { name: string; url: string; savedAt: number };

const KEY = "webDownloadHistory";
const MAX_ENTRIES = 50;

export async function getWebDownloadHistory(): Promise<WebDownloadEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WebDownloadEntry[]) : [];
  } catch {
    return [];
  }
}

// Newest first; opening the same file again moves it to the top instead
// of adding a duplicate. Never throws — a storage hiccup must not turn a
// download that already opened fine into an error alert.
export async function addToWebDownloadHistory(entry: { name: string; url: string }): Promise<void> {
  try {
    const existing = await getWebDownloadHistory();
    const next = [
      { name: entry.name, url: entry.url, savedAt: Date.now() },
      ...existing.filter((e) => e.url !== entry.url),
    ].slice(0, MAX_ENTRIES);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // intentionally swallowed
  }
}
