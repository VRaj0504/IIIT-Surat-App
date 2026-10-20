import React from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';
import * as Haptics from 'expo-haptics';

type TapCardProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  // Off by default. A haptic tick fires on a completed tap only — never
  // on touch-down, which also fires when a scroll merely STARTS on top of
  // a card (that was the "sticky / resistive" feel).
  haptic?: 'light' | 'medium' | 'none';
  pressScale?: number;
};

// Instant, native-thread-free press feedback: a slight dim + shrink while
// the finger is down. No springs to wait on, so taps feel immediate.
export default function TapCard({ style, children, haptic = 'none', pressScale = 0.98, onPress, ...rest }: TapCardProps) {
  return (
    <Pressable
      {...rest}
      onPress={(e) => {
        if (haptic !== 'none') {
          Haptics.impactAsync(
            haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
          ).catch(() => {});
        }
        onPress?.(e);
      }}
      style={({ pressed }) => [style, pressed && { opacity: 0.85, transform: [{ scale: pressScale }] }]}
    >
      {children}
    </Pressable>
  );
}
