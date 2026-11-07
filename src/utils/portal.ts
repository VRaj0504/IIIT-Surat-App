import { Linking } from "react-native";

export const FACULTY_PORTAL_URL = "https://collegego-faculty.web.app";

export function openFacultyPortal(): void {
  Linking.openURL(FACULTY_PORTAL_URL).catch(() => {});
}
