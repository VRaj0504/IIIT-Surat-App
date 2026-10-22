import AsyncStorage from "@react-native-async-storage/async-storage";

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
