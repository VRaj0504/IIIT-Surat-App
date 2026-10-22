import React from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';
import * as Haptics from 'expo-haptics';

type TapCardProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;

  haptic?: 'light' | 'medium' | 'none';
  pressScale?: number;
};

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
