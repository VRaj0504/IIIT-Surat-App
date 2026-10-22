import { Linking } from "react-native";

const ALLOWED = /^(https?:\/\/|mailto:|tel:)/i;

export function openSafeUrl(url: string | null | undefined): Promise<void> {
  const trimmed = (url ?? "").trim();
  if (!ALLOWED.test(trimmed)) return Promise.reject(new Error("Blocked link"));
  return Linking.openURL(trimmed);
}
