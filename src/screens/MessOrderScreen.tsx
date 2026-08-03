import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import {
  colors,
  spacing,
  radius,
  typography,
  clayShadowSoft,
  clayShadow,
} from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import ClayCard from "../components/ClayCard";
import {
  subscribeToMenuItems,
  placeOrder,
  buildUpiPaymentUrl,
  MessMenuItem,
  MessCategory,
  CartLine,
} from "../firebase/messService";
import { getCurrentSemester } from "../utils/academicInfo";
import { subscribeToTimetable, Timetable } from "../firebase/timetableService";
import { getOrderingWindowStatus } from "../utils/breakWindow";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const categoryIcons: Record<MessCategory, keyof typeof Ionicons.glyphMap> = {
  Thali: "restaurant",
  Snacks: "fast-food",
  Beverages: "cafe",
};

const CATEGORIES: MessCategory[] = ["Thali", "Snacks", "Beverages"];

export default function MessOrderScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile } = useAuth();

  const [items, setItems] = useState<MessMenuItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({}); // itemId -> qty
  const [activeCategory, setActiveCategory] = useState<MessCategory>("Thali");
  const [placing, setPlacing] = useState(false);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const unsub = subscribeToMenuItems((data) => {
      setItems(data);
      setLoadingItems(false);
    });
    return unsub;
  }, []);

  const semester = profile?.admissionYear
    ? getCurrentSemester(profile.admissionYear)
    : null;

  useEffect(() => {
    if (!profile?.branch || !profile?.section || !semester) {
      setTimetable(null);
      return;
    }
    const unsub = subscribeToTimetable(
      profile.branch,
      semester,
      profile.section,
      setTimetable,
    );
    return unsub;
  }, [profile?.branch, profile?.section, semester]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const windowStatus = getOrderingWindowStatus(timetable, now);
  const orderingOpen = windowStatus.state === "open";

  const itemsInCategory = items.filter((i) => i.category === activeCategory);

  const cartLines: CartLine[] = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => {
        const item = items.find((i) => i.id === itemId)!;
        return { itemId, name: item.name, price: item.price, qty };
      });
  }, [cart, items]);

  const totalAmount = cartLines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const totalCount = cartLines.reduce((sum, l) => sum + l.qty, 0);

  const changeQty = (itemId: string, delta: number) => {
    const item = items.find((i) => i.id === itemId);
    const cap =
      item && typeof item.remainingQty === "number"
        ? item.remainingQty
        : Infinity;
    setCart((prev) => {
      const next = {
        ...prev,
        [itemId]: Math.min(cap, Math.max(0, (prev[itemId] ?? 0) + delta)),
      };
      return next;
    });
  };

  const handlePlaceOrder = async () => {
    if (!profile?.uid || cartLines.length === 0) return;
    if (!orderingOpen) {
      const message =
        windowStatus.state === "cutoff_passed"
          ? `Ordering closed 15 min before your ${windowStatus.breakStart} break so the mess has time to prep. It'll open again for your next break.`
          : "There's no break window on your timetable right now, so ordering is closed.";
      Alert.alert("Ordering closed", message);
      return;
    }
    setPlacing(true);
    try {
      const { orderId, tokenNumber } = await placeOrder(
        profile.uid,
        profile.name,
        cartLines,
        windowStatus.state === "open"
          ? { start: windowStatus.breakStart, end: windowStatus.breakEnd }
          : null,
      );
      const upiUrl = buildUpiPaymentUrl({ totalAmount, tokenNumber });
      const canOpen = await Linking.canOpenURL(upiUrl);
      setCart({});
      if (canOpen) {
        await Linking.openURL(upiUrl);
      } else {
        Alert.alert(
          "No UPI app found",
          "Pay the canteen directly using its QR code, then show your token at the counter.",
        );
      }
      navigation.replace("MessToken", { orderId });
    } catch (e: any) {
      Alert.alert("Could not place order", e?.message ?? "Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Order Food</Text>
        </View>

        {windowStatus.state === "open" && (
          <View style={[styles.windowBanner, styles.windowBannerOpen]}>
            <Ionicons name="time-outline" size={14} color={colors.primary} />
            <Text style={styles.windowBannerText}>
              Order by {windowStatus.breakStart} minus 15 min — closes in{" "}
              {windowStatus.closesInMinutes} min
            </Text>
          </View>
        )}
        {windowStatus.state === "cutoff_passed" && (
          <View style={[styles.windowBanner, styles.windowBannerClosed]}>
            <Ionicons name="close-circle-outline" size={14} color="#a13c3c" />
            <Text style={[styles.windowBannerText, { color: "#a13c3c" }]}>
              Ordering closed for your {windowStatus.breakStart} break — the
              15 min prep cutoff has passed
            </Text>
          </View>
        )}
        {windowStatus.state === "no_break_today" && (
          <View style={[styles.windowBanner, styles.windowBannerClosed]}>
            <Ionicons name="close-circle-outline" size={14} color="#a13c3c" />
            <Text style={[styles.windowBannerText, { color: "#a13c3c" }]}>
              No break window found on your timetable right now — ordering is
              closed
            </Text>
          </View>
        )}

        <View style={styles.categoryRow}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryTab,
                activeCategory === cat && styles.categoryTabActive,
              ]}
              onPress={() => setActiveCategory(cat)}
            >
              <Ionicons
                name={categoryIcons[cat]}
                size={16}
                color={activeCategory === cat ? "#fff" : colors.primary}
              />
              <Text
                style={[
                  styles.categoryTabText,
                  activeCategory === cat && styles.categoryTabTextActive,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loadingItems ? (
          <ActivityIndicator
            color={colors.primary}
            style={{ marginTop: spacing.lg }}
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {itemsInCategory.length === 0 ? (
              <Text style={styles.emptyText}>
                Nothing available in {activeCategory} right now.
              </Text>
            ) : (
              itemsInCategory.map((item) => {
                const qty = cart[item.id] ?? 0;
                const limited = typeof item.remainingQty === "number";
                const atCap = limited && qty >= (item.remainingQty as number);
                return (
                  <ClayCard key={item.id} soft style={styles.itemRow}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemPrice}>₹{item.price}</Text>
                      {limited && (
                        <Text style={styles.itemStock}>
                          {item.remainingQty} left today
                        </Text>
                      )}
                    </View>
                    {qty === 0 ? (
                      <TouchableOpacity
                        style={styles.addBtn}
                        onPress={() => changeQty(item.id, 1)}
                      >
                        <Text style={styles.addBtnText}>Add</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.stepper}>
                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => changeQty(item.id, -1)}
                        >
                          <Ionicons
                            name="remove"
                            size={16}
                            color={colors.primary}
                          />
                        </TouchableOpacity>
                        <Text style={styles.stepperQty}>{qty}</Text>
                        <TouchableOpacity
                          style={[
                            styles.stepperBtn,
                            atCap && styles.stepperBtnDisabled,
                          ]}
                          onPress={() => !atCap && changeQty(item.id, 1)}
                          disabled={atCap}
                        >
                          <Ionicons
                            name="add"
                            size={16}
                            color={atCap ? colors.textSecondary : colors.primary}
                          />
                        </TouchableOpacity>
                      </View>
                    )}
                  </ClayCard>
                );
              })
            )}
            <View style={{ height: totalCount > 0 ? 100 : spacing.md }} />
          </ScrollView>
        )}

        {totalCount > 0 && (
          <View style={styles.cartBarWrap}>
            <View style={[styles.cartBar, clayShadow]}>
              <View>
                <Text style={styles.cartBarCount}>
                  {totalCount} item{totalCount > 1 ? "s" : ""}
                </Text>
                <Text style={styles.cartBarTotal}>₹{totalAmount}</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.placeOrderBtn,
                  !orderingOpen && styles.placeOrderBtnDisabled,
                ]}
                onPress={handlePlaceOrder}
                disabled={placing || !orderingOpen}
              >
                {placing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Text style={styles.placeOrderText}>
                      {orderingOpen ? "Pay & Get Token" : "Ordering closed"}
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  title: { ...typography.h1, color: colors.textPrimary },
  windowBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  windowBannerOpen: { backgroundColor: "#e6f4ea" },
  windowBannerWaiting: { backgroundColor: "#fff6dd" },
  windowBannerClosed: { backgroundColor: "#fbe9e9" },
  windowBannerText: {
    ...typography.caption,
    color: colors.primary,
    flex: 1,
    fontWeight: "600",
  },
  placeOrderBtnDisabled: { backgroundColor: "rgba(255,255,255,0.10)" },
  categoryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  categoryTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.claySurface,
    ...clayShadowSoft,
  },
  categoryTabActive: { backgroundColor: colors.primary },
  categoryTabText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  categoryTabTextActive: { color: "#fff" },
  list: { paddingBottom: spacing.xl },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemInfo: { flex: 1 },
  itemName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  itemPrice: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemStock: {
    ...typography.caption,
    color: colors.accent,
    marginTop: 2,
    fontWeight: "600",
  },
  addBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: radius.full,
  },
  addBtnText: { ...typography.caption, color: "#fff", fontWeight: "700" },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnDisabled: { opacity: 0.4 },
  stepperQty: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
    minWidth: 18,
    textAlign: "center",
  },
  cartBarWrap: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
  },
  cartBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  cartBarCount: { ...typography.caption, color: "rgba(255,255,255,0.8)" },
  cartBarTotal: { ...typography.h3, color: "#fff" },
  placeOrderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radius.full,
  },
  placeOrderText: { ...typography.body, color: "#fff", fontWeight: "700" },
});