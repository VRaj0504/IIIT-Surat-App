import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import TapCard from './TapCard';
import { colors, radius } from '../theme/theme';

type ClayCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  soft?: boolean; // kept for API compatibility with existing call sites — no longer changes anything, see below
  flat?: boolean; // same as above
};


const LAYOUT_KEYS = [
  'width', 'minWidth', 'maxWidth',
  'height', 'minHeight', 'maxHeight',
  'flex', 'flexBasis', 'flexGrow', 'flexShrink',
  'alignSelf',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical',
] as const;

function splitLayoutStyle(style: StyleProp<ViewStyle>): [ViewStyle, ViewStyle] {
  const flat = (StyleSheet.flatten(style) || {}) as Record<string, unknown>;
  const layout: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(flat)) {
    if ((LAYOUT_KEYS as readonly string[]).includes(key)) {
      layout[key] = flat[key];
    } else {
      rest[key] = flat[key];
    }
  }
  return [layout as ViewStyle, rest as ViewStyle];
}


export default function ClayCard({ children, style, onPress }: ClayCardProps) {
  const Wrapper = onPress ? TapCard : View;
  const [layoutStyle, contentStyle] = splitLayoutStyle(style);

  return (
    <Wrapper style={[styles.wrap, layoutStyle]} onPress={onPress}>
      <View style={[styles.inner, contentStyle]}>{children}</View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inner: {
   
    width: '100%',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
});
