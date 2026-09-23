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

// Style keys that decide how big a *slot* this card takes up in its parent
// layout (e.g. `width: '31%'` in a grid). These must land on the outer
// Wrapper, not the inner View: the Wrapper is the real flex child of the
// caller's grid, so that's the box a percentage width needs to resolve
// against. Previously the whole `style` prop (including width) went only to
// the inner View, whose own parent (the Wrapper) had no explicit size — so
// the percentage resolved against an undefined box and silently collapsed
// to the inner content's intrinsic width (basically just the icon), which
// is why grid labels were wrapping almost letter by letter.
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

// Was a raised claymorphism card (shadow + a top highlight sliver to read
// as "molded plastic"). Redesigned flat for the soft-campus direction: no
// shadow/elevation at all — which also means Android can no longer render
// an unwanted dark shadow here, structurally, not just a tuned-down one.
// Does keep a thin border, though (added after the first flat pass):
// with zero shadow AND a small/zero gap between cards in some grids
// (e.g. ClubsScreen's numColumns grid had no row gap at all), plain white
// cards on the warm background had nothing to visually separate one from
// the next — they read as merging into each other rather than as
// individual cards. A hairline border is enough definition without
// bringing back any elevation dependency. `soft`/`flat` props still exist
// so none of this component's call sites need to change, they just no
// longer affect anything since there's no shadow left to vary.
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
    // Always fills whatever box the Wrapper resolves to — sizing itself
    // (width/height/flex/margin) is handled by the Wrapper above via
    // layoutStyle, so this View never needs its own percentage width.
    width: '100%',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
});
