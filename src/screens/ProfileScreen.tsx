import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// Each item navigates to a real stack screen — Edit Profile and Attendance
// History are fully functional; the rest route to PlaceholderScreen until
// they're built out, same pattern as Lost & Found / Faculty Directory.
const menuItems: { label: string; icon: keyof typeof Ionicons.glyphMap; route: keyof RootStackParamList }[] = [
  { label: 'Edit Profile', icon: 'person-outline', route: 'EditProfile' },
  { label: 'Attendance History', icon: 'stats-chart-outline', route: 'Attendance' },
  { label: 'Notification Settings', icon: 'notifications-outline', route: 'NotificationSettings' },
  { label: 'Help & Support', icon: 'help-circle-outline', route: 'HelpSupport' },
  { label: 'About', icon: 'information-circle-outline', route: 'About' },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export default function ProfileScreen() {
  const { profile, logOut } = useAuth();
  const navigation = useNavigation<NavProp>();

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logOut() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(profile?.name ?? '?')}</Text>
        </View>
        <Text style={styles.name}>{profile?.name ?? 'Loading…'}</Text>
        <Text style={styles.enrollment}>
          {profile?.role === 'faculty' ? 'Faculty' : profile?.enrollmentNumber ?? ''}
          {profile?.role === 'student' ? ' · CSE' : ''}
        </Text>
      </View>

      <View style={styles.menu}>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={() => navigation.navigate(item.route as any)}
          >
            <Ionicons name={item.icon} size={20} color={colors.primary} style={styles.menuIcon} />
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <Text style={styles.credit}>Made with 🛠️ by Vaibhav Raj</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  header: { alignItems: 'center', paddingVertical: spacing.xl },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  name: { ...typography.h2, color: colors.textPrimary },
  enrollment: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  menu: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuIcon: { marginRight: spacing.md },
  menuLabel: { flex: 1, ...typography.body, color: colors.textPrimary },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  logoutText: { color: colors.danger, fontWeight: '700' },
  credit: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg },
});
