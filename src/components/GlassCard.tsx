import React from 'react';
import { StyleSheet, ViewStyle, StyleProp, Platform, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius } from '../theme/theme';

type GlassCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
};

export default function GlassCard({ children, style, intensity = 40 }: GlassCardProps) {
  return (
    <View style={[styles.wrap, style]}>
      <BlurView
        intensity={intensity}
        tint="light"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.tintOverlay} pointerEvents="none" />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    // Android BlurView support is weaker, so we lean on the tint overlay there
    backgroundColor: Platform.OS === 'android' ? colors.glassTint : 'transparent',
  },
  tintOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glassTint,
  },
  content: { padding: 0 },
});