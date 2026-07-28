import React from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

type TapCardProps = PressableProps & {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  // Lighter haptic for small/frequent taps (grid items), medium for
  // higher-weight actions. Set to 'none' to skip haptics entirely (e.g. for
  // something that already has its own custom feedback).
  haptic?: 'light' | 'medium' | 'none';
  // How much the element shrinks on press. 0.96 is subtle (default), lower
  // values feel "squishier".
  pressScale?: number;
};

// A drop-in replacement for TouchableOpacity that adds a smooth spring
// scale-down on press plus a haptic tick — the two cheapest, highest-impact
// things for making an app feel physically responsive instead of flat.
export default function TapCard({
  style,
  children,
  haptic = 'light',
  pressScale = 0.96,
  onPressIn,
  onPressOut,
  ...rest
}: TapCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressableBase
      style={[style, animatedStyle]}
      onPressIn={(e) => {
        scale.value = withSpring(pressScale, { damping: 15, stiffness: 400 });
        if (haptic !== 'none') {
          Haptics.impactAsync(
            haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
          ).catch(() => {});
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 15, stiffness: 400 });
        onPressOut?.(e);
      }}
      {...rest}
    >
      {children}
    </AnimatedPressableBase>
  );
}
