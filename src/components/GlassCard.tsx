import React from 'react';
import { StyleSheet, ViewStyle, StyleProp, View } from 'react-native';
import { colors, radius } from '../theme/theme';

type GlassCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number; // kept for API compatibility with existing call sites — no longer used, see below
};

// Was a glassmorphism card (BlurView + a translucent white tint layered
// on top) — dropped for the soft-campus flat direction, for two
// reasons: it doesn't fit a flat design language to begin with, and it
// was the exact source of an earlier real bug (the tint was layered
// TWICE — once as the Android fallback background, once again as a
// separate overlay on every platform — which read as a dull, hazy card
// instead of crisp glass). A flat card sidesteps both: no blur, no
// layered translucency, nothing left to double up.
export default function GlassCard({ children, style }: GlassCardProps) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  content: { padding: 0 },
});
