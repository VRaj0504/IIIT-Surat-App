import React from "react";
import { View, Text, Image, Pressable, Linking, StyleSheet } from "react-native";
import { colors, spacing, radius, typography } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { useWebLayout } from "../utils/useWebLayout";

const NAV_ITEMS = ["Home", "Timetable", "Notices", "Clubs", "Profile"] as const;

type Props = {
  navigationRef: { navigate: (...args: any[]) => void; isReady: () => boolean };
  currentRoute: string | undefined;
  children: React.ReactNode;
};

const pointer: any = { cursor: "pointer" };

// Website chrome for wide browser windows: a top navigation bar, a centered
// content column and a slim footer. On phones, and on narrow browser
// windows, it renders nothing extra — the normal app layout is used
// (bottom tabs, full width).
export default function WebShell({ navigationRef, currentRoute, children }: Props) {
  const { isDesktop } = useWebLayout();
  const { user, profile, logOut } = useAuth();

  if (!isDesktop) return <>{children}</>;

  const signedIn = !!user && !!profile;
  const go = (screen: string) => {
    if (navigationRef.isReady()) navigationRef.navigate("Tabs", { screen });
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <Pressable style={[styles.brand, pointer]} onPress={() => signedIn && go("Home")}>
            <Image source={require("../../assets/icon.png")} style={styles.logo} />
            <View>
              <Text style={styles.brandTitle}>IIIT Surat</Text>
              <Text style={styles.brandSub}>Campus Portal</Text>
            </View>
          </Pressable>

          {signedIn && (
            <View style={styles.nav}>
              {NAV_ITEMS.map((item) => {
                const active = currentRoute === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => go(item)}
                    style={(state: any) => [
                      styles.navItem,
                      pointer,
                      (active || state.hovered) && styles.navItemActive,
                    ]}
                  >
                    <Text style={[styles.navText, active && styles.navTextActive]}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {signedIn && (
            <View style={styles.user}>
              <Text style={styles.userName} numberOfLines={1}>
                {profile?.name}
              </Text>
              <Pressable
                onPress={() => logOut()}
                style={(state: any) => [styles.logout, pointer, state.hovered && styles.logoutHover]}
              >
                <Text style={styles.logoutText}>Log out</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <View style={styles.body}>
        <View style={[styles.column, { maxWidth: signedIn ? 960 : 480 }]}>{children}</View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          © {new Date().getFullYear()} IIIT Surat App ·{" "}
          <Text
            style={[styles.footerLink, pointer]}
            onPress={() => Linking.openURL("https://iiitsurat.ac.in").catch(() => {})}
          >
            iiitsurat.ac.in
          </Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: "center",
  },
  headerInner: {
    width: "100%",
    maxWidth: 1180,
    height: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logo: { width: 38, height: 38, borderRadius: 10 },
  brandTitle: { ...typography.h3, color: colors.primary, lineHeight: 20 },
  brandSub: { ...typography.caption, color: colors.textSecondary },
  nav: { flexDirection: "row", gap: spacing.xs, flex: 1, justifyContent: "center" },
  navItem: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.full },
  navItemActive: { backgroundColor: colors.badge.blue.bg },
  navText: { ...typography.body, color: colors.textPrimary, fontWeight: "500" },
  navTextActive: { color: colors.primary, fontWeight: "700" },
  user: { flexDirection: "row", alignItems: "center", gap: spacing.md, maxWidth: 280 },
  userName: { ...typography.body, color: colors.textPrimary, flexShrink: 1 },
  logout: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutHover: { backgroundColor: colors.background },
  logoutText: { ...typography.caption, color: colors.primary, fontWeight: "600" },
  body: { flex: 1, alignItems: "center", paddingVertical: spacing.md },
  column: {
    flex: 1,
    width: "100%",
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  footer: {
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerText: { ...typography.caption, color: colors.textSecondary },
  footerLink: { color: colors.primary, fontWeight: "600" },
});
