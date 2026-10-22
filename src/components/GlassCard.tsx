import React from 'react';
import { StyleSheet, ViewStyle, StyleProp, View } from 'react-native';
import { colors, radius } from '../theme/theme';

type GlassCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
};

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
