import React, { useEffect } from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors } from "../theme/theme";

type Props = {
  style?: StyleProp<ViewStyle>;
  size?: number;
};

// A soft breathing-pulse loader — three dots scaling and fading in a
// staggered wave — replacing the plain, generic ActivityIndicator used
// identically across ~14 screens in this app. Deliberately simple:
// three shared values, one repeating sequence each, offset by a small
// delay so they don't move in lockstep.
export default function LoadingSpinner({ style, size = 10 }: Props) {
  const dot1 = useSharedValue(0.4);
  const dot2 = useSharedValue(0.4);
  const dot3 = useSharedValue(0.4);

  useEffect(() => {
    const pulse = () =>
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) }),
          withTiming(0.4, { duration: 400, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );

    dot1.value = pulse();
    const t2 = setTimeout(() => (dot2.value = pulse()), 130);
    const t3 = setTimeout(() => (dot3.value = pulse()), 260);
    return () => {
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style1 = useAnimatedStyle(() => ({ opacity: dot1.value, transform: [{ scale: dot1.value }] }));
  const style2 = useAnimatedStyle(() => ({ opacity: dot2.value, transform: [{ scale: dot2.value }] }));
  const style3 = useAnimatedStyle(() => ({ opacity: dot3.value, transform: [{ scale: dot3.value }] }));

  const dotStyle = { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary };

  return (
    <View style={[styles.row, style]}>
      <Animated.View style={[dotStyle, style1]} />
      <Animated.View style={[dotStyle, style2]} />
      <Animated.View style={[dotStyle, style3]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
});
