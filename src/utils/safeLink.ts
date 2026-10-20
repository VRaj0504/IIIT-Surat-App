import { Linking } from "react-native";

// Links typed by other users (notice links, resource links, club links...)
// are only opened if they are plain web, mail or phone links — never
// javascript:, intent:, file: or custom app schemes.
const ALLOWED = /^(https?:\/\/|mailto:|tel:)/i;

export function openSafeUrl(url: string | null | undefined): Promise<void> {
  const trimmed = (url ?? "").trim();
  if (!ALLOWED.test(trimmed)) return Promise.reject(new Error("Blocked link"));
  return Linking.openURL(trimmed);
}
