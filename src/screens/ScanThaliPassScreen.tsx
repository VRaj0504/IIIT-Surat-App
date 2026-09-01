import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { verifyAndLogMealScan, ScanResult } from "../firebase/messSubscriptionService";
import LoadingSpinner from "../components/LoadingSpinner";

const RESULT_COPY: Record<ScanResult["status"], { title: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  valid: { title: "Valid", color: colors.success, icon: "checkmark-circle" },
  not_subscribed: { title: "Not Subscribed", color: colors.danger, icon: "close-circle" },
  already_used: { title: "Already Used", color: colors.warning, icon: "alert-circle" },
  outside_meal_hours: { title: "Outside Meal Hours", color: colors.textSecondary, icon: "time-outline" },
};

export default function ScanThaliPassScreen() {
  const { profile } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [resultName, setResultName] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleScan = async (enrollmentNumber: string) => {
    if (processing || !profile) return;
    setProcessing(true);
    setScanning(false);
    try {
      const scanResult = await verifyAndLogMealScan(enrollmentNumber, profile.uid);
      setResult(scanResult);
      setResultName(scanResult.status === "valid" ? scanResult.name : null);
      Haptics.notificationAsync(
        scanResult.status === "valid"
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      ).catch(() => {});
    } catch (err) {
      setResult(null);
    } finally {
      setProcessing(false);
    }
  };

  const handleScanNext = () => {
    setResult(null);
    setResultName(null);
    setScanning(true);
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.header}>Scan Thali Pass</Text>

        {!permission ? (
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        ) : !permission.granted ? (
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionText}>Camera access is needed to scan passes.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
              <Text style={styles.primaryBtnText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        ) : scanning ? (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={(scanEvent) => handleScan(scanEvent.data)}
            />
          </View>
        ) : (
          <View style={styles.resultContainer}>
            {processing ? (
              <LoadingSpinner />
            ) : result ? (
              <>
                <Ionicons name={RESULT_COPY[result.status].icon} size={72} color={RESULT_COPY[result.status].color} />
                <Text style={[styles.resultTitle, { color: RESULT_COPY[result.status].color }]}>
                  {RESULT_COPY[result.status].title}
                </Text>
                {resultName && <Text style={styles.resultName}>{resultName}</Text>}
                {result.status === "valid" && (
                  <Text style={styles.resultMeal}>{result.mealSlot.toUpperCase()}</Text>
                )}
                {result.status === "already_used" && (
                  <Text style={styles.resultMeal}>{result.mealSlot.toUpperCase()} already scanned today</Text>
                )}
              </>
            ) : (
              <Text style={styles.resultTitle}>Scan failed — try again</Text>
            )}
            <TouchableOpacity style={styles.primaryBtn} onPress={handleScanNext}>
              <Text style={styles.primaryBtnText}>Scan Next</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center" },
  header: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.md },
  permissionContainer: { alignItems: "center", gap: spacing.md, marginTop: spacing.xl, paddingHorizontal: spacing.xl },
  permissionText: { ...typography.body, color: colors.textPrimary, textAlign: "center" },
  cameraWrap: {
    width: "90%",
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginTop: spacing.lg,
    ...clayShadowSoft,
  },
  resultContainer: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xl * 2, paddingHorizontal: spacing.xl },
  resultTitle: { ...typography.h2, fontWeight: "800" },
  resultName: { ...typography.h3, color: colors.textPrimary },
  resultMeal: { ...typography.body, color: colors.textSecondary },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
    ...clayShadowSoft,
  },
  primaryBtnText: { color: colors.surface, fontWeight: "700", fontSize: 16 },
});
