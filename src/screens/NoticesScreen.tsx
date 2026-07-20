import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { subscribeToNotices, deleteNotice, Notice } from '../firebase/noticesService';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const categoryColors: Record<Notice['category'], string> = {
  Academic: '#0B3D91',
  Placement: '#22A559',
  Event: '#F5A623',
  General: '#6B7280',
  Club: '#8B5CF6',
};

export default function NoticesScreen() {
  const navigation = useNavigation<NavProp>();
  const { user, profile } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToNotices((updated) => {
      setNotices(updated);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleDelete = (notice: Notice) => {
    Alert.alert('Delete notice?', `"${notice.title}" will be removed for everyone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteNotice(notice.id).catch(() => {}),
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]} edges={['top']}>
        <ActivityIndicator color={colors.textPrimary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Notices</Text>
        {profile?.role === 'faculty' && (
          <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('PostNotice', undefined)}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={notices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.badge, { backgroundColor: categoryColors[item.category] }]}>
                <Text style={styles.badgeText}>
                  {item.clubId ? item.clubName : item.category}
                </Text>
              </View>
              <Text style={styles.date}>
                {item.createdAt ? item.createdAt.toDate().toLocaleDateString() : ''}
              </Text>
            </View>
            <Text style={styles.noticeTitle}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
            {item.link && (
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => Linking.openURL(item.link!).catch(() => {})}
              >
                <Ionicons name="document-attach-outline" size={16} color={colors.primary} />
                <Text style={styles.linkText}>Open attachment</Text>
              </TouchableOpacity>
            )}
            {(user?.uid === item.createdBy || profile?.role === 'faculty') && (
              <View style={styles.ownerRow}>
                {user?.uid === item.createdBy && (
                  <TouchableOpacity
                    style={styles.ownerBtn}
                    onPress={() => navigation.navigate('PostNotice', { editingNotice: item })}
                  >
                    <Ionicons name="pencil-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.ownerBtnText}>Edit</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.ownerBtn} onPress={() => handleDelete(item)}>
                  <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  <Text style={[styles.ownerBtnText, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  centered: { justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  badge: { paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radius.full },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  date: { ...typography.caption, color: colors.textSecondary },
  noticeTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.xs },
  description: { ...typography.body, color: colors.textSecondary },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  linkText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  ownerRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  ownerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ownerBtnText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
});