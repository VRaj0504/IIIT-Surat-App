import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Alert, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { colors, spacing, typography } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { createRazorpayRechargeOrder } from "../firebase/messService";
import LoadingSpinner from "../components/LoadingSpinner";

type NavProp = NativeStackNavigationProp<RootStackParamList, "RechargeCheckout">;
type RechargeCheckoutRoute = RouteProp<RootStackParamList, "RechargeCheckout">;

// Builds the page loaded into the WebView — Razorpay's checkout.js,
// auto-opened with this order's details the instant the page loads.
// Success/failure/dismissal all relay back via
// window.ReactNativeWebView.postMessage. The wallet credit itself never
// happens here — it happens server-side, via razorpayWebhook, once
// Razorpay actually confirms the payment captured. This screen only
// reports what the Checkout UI told the student, not the source of truth.
function buildCheckoutHtml(params: {
  keyId: string;
  amount: number;
  currency: string;
  orderId: string;
  studentName: string;
  email: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;background:#fff;">
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  var options = {
    key: "${params.keyId}",
    amount: "${params.amount}",
    currency: "${params.currency}",
    order_id: "${params.orderId}",
    name: "IIIT Surat Mess Wallet",
    description: "Wallet recharge",
    prefill: { name: "${params.studentName.replace(/"/g, "")}", email: "${params.email}" },
    theme: { color: "#0B3D91" },
    handler: function (response) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ status: "success", paymentId: response.razorpay_payment_id }));
    },
    modal: {
      ondismiss: function () {
        window.ReactNativeWebView.postMessage(JSON.stringify({ status: "dismissed" }));
      }
    }
  };
  var rzp = new Razorpay(options);
  rzp.on("payment.failed", function (response) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ status: "failed", reason: response.error.description }));
  });
  rzp.open();
</script>
</body>
</html>`;
}

export default function RechargeCheckoutScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RechargeCheckoutRoute>();
  const { profile } = useAuth();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handledResult = useRef(false);

  useEffect(() => {
    if (!profile) return;
    createRazorpayRechargeOrder(route.params.amount)
      .then((order) => {
        setHtml(
          buildCheckoutHtml({
            keyId: order.keyId,
            amount: order.amount,
            currency: order.currency,
            orderId: order.orderId,
            studentName: profile.name,
            email: profile.email,
          }),
        );
      })
      .catch((err: any) => {
        setError(err.message ?? "Couldn't start checkout. Please try again.");
      });
  }, [profile, route.params.amount]);

  const handleMessage = (event: { nativeEvent: { data: string } }) => {
    if (handledResult.current) return; // WebView can fire this more than once
    let payload: { status: string; paymentId?: string; reason?: string };
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (payload.status === "success") {
      handledResult.current = true;
      Alert.alert(
        "Payment received",
        "Your wallet will update in a few seconds once we confirm the payment.",
        [{ text: "OK", onPress: () => navigation.goBack() }],
      );
    } else if (payload.status === "failed") {
      handledResult.current = true;
      Alert.alert("Payment failed", payload.reason ?? "Please try again.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } else if (payload.status === "dismissed") {
      handledResult.current = true;
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : !html ? (
        <View style={styles.centerContainer}>
          <LoadingSpinner />
        </View>
      ) : (
        <WebView originWhitelist={["*"]} source={{ html }} onMessage={handleMessage} style={{ flex: 1 }} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl },
  errorText: { ...typography.body, color: colors.danger, textAlign: "center" },
});
