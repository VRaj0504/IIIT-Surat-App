import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Alert } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { colors, spacing, radius } from "../theme/theme";
import { Card, EmptyState, FieldLabel, PrimaryButton, Section, Segmented, StatusPill, ui } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import {
  subscribeToClubs,
  subscribeToClubEvents,
  setClubLead,
  revokeClubLeadAccess,
  deleteEvent,
  Club,
  ClubEvent,
  formatClubLeads,
  isFollowingClub,
  setFollowClub,
} from "../firebase/clubsService";
import { getClubIcon } from "../data/clubIcons";
import {
  subscribeToNotices,
  deleteNotice,
  Notice,
} from "../firebase/noticesService";
import { openSafeUrl } from "../utils/safeLink";
import { KeyboardAwareScrollView } from "../components/KeyboardAware";
import ClubCoreTeam from "../components/ClubCoreTeam";

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type DetailRoute = RouteProp<RootStackParamList, "ClubDetail">;

function formatEventDate(timestamp: ClubEvent["dateTime"]): string {
  const date = timestamp.toDate();
  return (
    date.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }) +
    " · " +
    date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
  );
}

function ClubDetailScreenInner() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<DetailRoute>();
  const { clubId, clubName } = route.params;
  const { user, profile } = useAuth();
  const [following, setFollowing] = useState(() => isFollowingClub(profile?.followedClubs, clubId));
  const [followBusy, setFollowBusy] = useState(false);
  const toggleFollow = async () => {
    if (!user) return;
    const next = !following;
    setFollowBusy(true);
    try {
      await setFollowClub(user.uid, clubId, next);
      setFollowing(next);
    } catch {
      Alert.alert("Couldn't update", "Check your internet and try again.");
    } finally {
      setFollowBusy(false);
    }
  };

  const [club, setClub] = useState<Club | null>(null);
  const [subClubs, setSubClubs] = useState<Club[]>([]);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [clubNotices, setClubNotices] = useState<Notice[]>([]);
  const [loadingNotices, setLoadingNotices] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const [leadNameInput, setLeadNameInput] = useState("");
  const [leadEmailInput, setLeadEmailInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [seededForClubId, setSeededForClubId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToClubs((clubs) => {
      const match = clubs.find((c) => c.id === clubId);
      setClub(match ?? null);
      setSubClubs(clubs.filter((c) => c.parentClubId === clubId));
    });
    return unsubscribe;
  }, [clubId]);

  const openSubClub = (subClub: Club) => {
    navigation.push("ClubDetail", {
      clubId: subClub.id,
      clubName: subClub.name,
    });
  };

  useEffect(() => {
    const unsubscribe = subscribeToClubEvents(clubId, (data) => {
      setEvents(data);
      setLoadingEvents(false);
    });
    return unsubscribe;
  }, [clubId]);

  useEffect(() => {

    const unsubscribe = subscribeToNotices((allNotices) => {
      setClubNotices(allNotices.filter((n) => n.clubId === clubId));
      setLoadingNotices(false);
    });
    return unsubscribe;
  }, [clubId]);

  useEffect(() => {
    if (club && seededForClubId !== club.id) {
      setLeadNameInput(club.leadName);
      setLeadEmailInput(club.leadEmail ?? "");
      setSeededForClubId(club.id);
    }
  }, [club, seededForClubId]);

  const isLead = !!user && !!club && user.uid === club.leadUid;
  const isFaculty = profile?.role === "faculty";

  const openLink = (url: string) => {
    openSafeUrl(url).catch(() => {});
  };

  const handleDeleteEvent = (event: ClubEvent) => {
    Alert.alert(
      "Delete event?",
      `"${event.title}" will be removed for everyone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteEvent(event.id).catch(() => {}),
        },
      ],
    );
  };

  const handleDeleteNotice = (notice: Notice) => {
    Alert.alert(
      "Delete notice?",
      `"${notice.title}" will be removed for everyone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteNotice(notice.id).catch(() => {}),
        },
      ],
    );
  };

  const handleSaveLead = async () => {
    setManageError(null);
    if (!leadNameInput.trim()) {
      setManageError("Lead name is required.");
      return;
    }
    setSaving(true);
    try {
      await setClubLead(
        clubId,
        leadNameInput.trim(),
        leadEmailInput.trim() || undefined,
      );
    } catch (e: any) {
      setManageError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    setManageError(null);
    setRevoking(true);
    try {
      await revokeClubLeadAccess(clubId);
      setLeadEmailInput("");
    } catch (e: any) {
      setManageError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setRevoking(false);
    }
  };

  const [tab, setTab] = useState<"events" | "notices">("events");
  const { icon, color } = getClubIcon(clubName);
  const canPost = isLead || isFaculty;

  return (
    <View style={styles.screen}>
      <KeyboardAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: color + "22" }]}>
            <Ionicons name={icon} size={30} color={color} />
          </View>
          <Text style={styles.title}>{clubName}</Text>
          {club ? (
            <>
              <View style={styles.heroMetaRow}>
                {club.category ? <StatusPill status="info" label={club.category} /> : null}
              </View>
              <Text style={styles.leads}>{formatClubLeads(club)}</Text>
              {club.description ? <Text style={styles.description}>{club.description}</Text> : null}
            </>
          ) : null}
          {!canPost && (
            <TouchableOpacity
              style={[styles.followBtn, following && styles.followBtnOn]}
              onPress={toggleFollow}
              disabled={followBusy}
              accessibilityLabel={following ? "Unfollow club" : "Follow club"}
            >
              {followBusy ? (
                <ActivityIndicator size="small" color={following ? colors.primary : colors.onPrimary} />
              ) : (
                <>
                  <Ionicons name={following ? "notifications" : "notifications-outline"} size={16} color={following ? colors.primary : colors.onPrimary} />
                  <Text style={[styles.followText, following && { color: colors.primary }]}>{following ? "Following" : "Follow"}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {!canPost && (
            <Text style={styles.followHint}>
              {following ? "You'll get a reminder an hour before each event." : "Follow to get a reminder an hour before each event."}
            </Text>
          )}
          {canPost && (
            <View style={styles.postRow}>
              <PrimaryButton
                label="Post event"
                icon="add-circle-outline"
                style={{ flex: 1, minHeight: 46 }}
                onPress={() => navigation.navigate("PostEvent", { clubId, clubName })}
              />
              <PrimaryButton
                tone="secondary"
                label="Post notice"
                icon="megaphone-outline"
                style={{ flex: 1, minHeight: 46 }}
                onPress={() => navigation.navigate("PostNotice", { clubId, clubName })}
              />
            </View>
          )}
        </View>

        {club && <ClubCoreTeam club={club} canEdit={canPost} />}

        {subClubs.length > 0 && (
          <Section title={`Clubs under ${clubName}`}>
            {subClubs.map((sc) => {
              const sub = getClubIcon(sc.name);
              return (
                <Card key={sc.id} style={styles.subClub} onPress={() => openSubClub(sc)}>
                  <View style={[styles.subIcon, { backgroundColor: sub.color + "22" }]}>
                    <Ionicons name={sub.icon} size={18} color={sub.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subName}>{sc.name}</Text>
                    <Text style={styles.subLead} numberOfLines={1}>
                      {formatClubLeads(sc)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </Card>
              );
            })}
          </Section>
        )}

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "events", label: "Events", badge: events.length || undefined },
            { value: "notices", label: "Notices", badge: clubNotices.length || undefined },
          ]}
        />

        {tab === "events" ? (
          loadingEvents ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
          ) : events.length === 0 ? (
            <EmptyState icon="calendar-clear-outline" title="No events yet" hint={canPost ? "Tap Post event to add one." : undefined} />
          ) : (
            events.map((item) => {
              const d = item.dateTime.toDate();
              return (
                <Card key={item.id} style={styles.item}>
                  <View style={styles.itemHead}>
                    <View style={[styles.dateBox, { backgroundColor: color + "1F" }]}>
                      <Text style={[styles.dateDay, { color }]}>{d.getDate()}</Text>
                      <Text style={[styles.dateMonth, { color }]}>
                        {d.toLocaleDateString("en-IN", { month: "short" }).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <Text style={styles.itemMeta}>
                        {formatEventDate(item.dateTime)}
                        {item.venue ? ` · ${item.venue}` : ""}
                      </Text>
                      {item.category ? <Text style={styles.itemCat}>{item.category}</Text> : null}
                    </View>
                  </View>
                  {item.description ? <Text style={styles.itemBody}>{item.description}</Text> : null}
                  <View style={styles.itemActions}>
                    {item.link ? (
                      <TouchableOpacity style={styles.linkBtn} onPress={() => openLink(item.link!)}>
                        <Ionicons name="open-outline" size={15} color={colors.primary} />
                        <Text style={styles.linkText}>Open link</Text>
                      </TouchableOpacity>
                    ) : null}
                    {user?.uid === item.createdBy && (
                      <>
                        <TouchableOpacity
                          style={styles.ownerBtn}
                          onPress={() => navigation.navigate("PostEvent", { clubId, clubName, editingEvent: item })}
                        >
                          <Ionicons name="pencil-outline" size={14} color={colors.textSecondary} />
                          <Text style={styles.ownerBtnText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.ownerBtn} onPress={() => handleDeleteEvent(item)}>
                          <Ionicons name="trash-outline" size={14} color={colors.danger} />
                          <Text style={[styles.ownerBtnText, { color: colors.danger }]}>Delete</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </Card>
              );
            })
          )
        ) : loadingNotices ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
        ) : clubNotices.length === 0 ? (
          <EmptyState icon="megaphone-outline" title="No notices yet" hint={canPost ? "Tap Post notice to add one." : undefined} />
        ) : (
          clubNotices.map((notice) => (
            <Card key={notice.id} style={styles.item}>
              <Text style={styles.itemTitle}>{notice.title}</Text>
              <Text style={styles.itemBody}>{notice.description}</Text>
              <View style={styles.itemActions}>
                {notice.link ? (
                  <TouchableOpacity style={styles.linkBtn} onPress={() => openLink(notice.link!)}>
                    <Ionicons name="document-attach-outline" size={15} color={colors.primary} />
                    <Text style={styles.linkText}>Open attachment</Text>
                  </TouchableOpacity>
                ) : null}
                {user?.uid === notice.createdBy && (
                  <TouchableOpacity
                    style={styles.ownerBtn}
                    onPress={() => navigation.navigate("PostNotice", { clubId, clubName, editingNotice: notice })}
                  >
                    <Ionicons name="pencil-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.ownerBtnText}>Edit</Text>
                  </TouchableOpacity>
                )}
                {(user?.uid === notice.createdBy || isFaculty) && (
                  <TouchableOpacity style={styles.ownerBtn} onPress={() => handleDeleteNotice(notice)}>
                    <Ionicons name="trash-outline" size={14} color={colors.danger} />
                    <Text style={[styles.ownerBtnText, { color: colors.danger }]}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Card>
          ))
        )}

        {isFaculty && club && (
          <Card style={styles.manageCard}>
            <TouchableOpacity style={styles.manageHeader} onPress={() => setManageOpen((v) => !v)}>
              <Ionicons name="settings-outline" size={18} color={colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.manageTitle}>Manage club lead</Text>
                <Text style={styles.itemMeta}>
                  {club.leadName} · {club.leadUid ? "account linked" : "no account linked yet"}
                </Text>
              </View>
              <Ionicons name={manageOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            {manageOpen && (
              <View style={{ marginTop: spacing.md }}>
                {manageError ? <Text style={styles.error}>{manageError}</Text> : null}
                <FieldLabel>Lead name</FieldLabel>
                <TextInput
                  style={[ui.input, { marginBottom: spacing.md }]}
                  placeholder="Full name"
                  placeholderTextColor={colors.textSecondary}
                  value={leadNameInput}
                  onChangeText={setLeadNameInput}
                />
                <FieldLabel>Lead's institute email (optional)</FieldLabel>
                <TextInput
                  style={ui.input}
                  placeholder="lead@iiitsurat.ac.in"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={leadEmailInput}
                  onChangeText={setLeadEmailInput}
                />
                <Text style={styles.hint}>
                  To hand the club to next year's lead, enter their name and email. They can post once they sign in.
                </Text>
                <PrimaryButton label="Save" onPress={handleSaveLead} loading={saving} style={{ marginTop: spacing.md }} />
                {!!club.leadUid && (
                  <PrimaryButton
                    tone="danger"
                    label="Remove posting access"
                    onPress={handleRevoke}
                    loading={revoking}
                    style={{ marginTop: spacing.sm }}
                  />
                )}
              </View>
            )}
          </Card>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  followBtn: { marginTop: spacing.md, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 20, borderRadius: radius.full, backgroundColor: colors.primary },
  followBtnOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  followText: { color: colors.onPrimary, fontWeight: "800", fontSize: 14 },
  followHint: { marginTop: 6, textAlign: "center", fontSize: 12, color: colors.textSecondary },
  itemCat: { alignSelf: "flex-start", marginTop: 4, fontSize: 11, fontWeight: "700", color: colors.textSecondary, backgroundColor: colors.surfaceAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.md,
  },
  heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: "800", color: colors.textPrimary, textAlign: "center" },
  heroMetaRow: { flexDirection: "row", marginTop: spacing.sm },
  leads: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm, textAlign: "center" },
  description: { fontSize: 14, color: colors.textPrimary, lineHeight: 20, marginTop: spacing.sm, textAlign: "center" },
  postRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, alignSelf: "stretch" },
  subClub: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  subIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  subName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  subLead: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  item: { marginBottom: spacing.sm },
  itemHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dateBox: { width: 50, paddingVertical: 6, borderRadius: radius.md, alignItems: "center" },
  dateDay: { fontSize: 20, fontWeight: "800" },
  dateMonth: { fontSize: 10, fontWeight: "800" },
  itemTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  itemMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  itemBody: { fontSize: 14, color: colors.textPrimary, lineHeight: 20, marginTop: spacing.sm },
  itemActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.badge.blue.bg,
  },
  linkText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  ownerBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  ownerBtnText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  manageCard: { marginTop: spacing.lg },
  manageHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  manageTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  hint: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 17 },
  error: { fontSize: 13, color: colors.danger, marginBottom: spacing.sm, fontWeight: "600" },
});

export default function ClubDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  if (!route.params?.clubId) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.background }}>
        <Text style={{ fontSize: 15, color: colors.textSecondary, textAlign: "center", marginBottom: 12 }}>
          Open this from a club's page.
        </Text>
        <Text style={{ color: colors.primary, fontWeight: "700" }} onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Tabs" as never))}>
          Go back
        </Text>
      </View>
    );
  }
  return <ClubDetailScreenInner />;
}
