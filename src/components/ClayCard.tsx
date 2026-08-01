import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import TapCard from './TapCard';
import { colors, radius, clayShadow, clayShadowSoft } from '../theme/theme';

type ClayCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  soft?: boolean; // smaller shadow for dense grids
  flat?: boolean; // no shadow at all
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

export default function ClayCard({ children, style, onPress, soft, flat }: ClayCardProps) {
  const shadowStyle = flat ? undefined : (soft ? clayShadowSoft : clayShadow);
  const Wrapper = onPress ? TapCard : View;
  const [layoutStyle, contentStyle] = splitLayoutStyle(style);

  return (
    <Wrapper style={[styles.shadowWrap, shadowStyle, layoutStyle]} onPress={onPress}>
      <View style={[styles.inner, contentStyle]}>
        {/* top highlight sliver = the "molded plastic" cue */}
        <View style={styles.highlight} pointerEvents="none" />
        {children}
      </View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: radius.lg,
    // Must be opaque, not transparent: Android's `elevation` shadow (see
    // clayShadow/clayShadowSoft in theme.ts) only renders as a soft blur
    // against an opaque background — on a transparent one it paints as a
    // flat grey box instead. `inner` sits exactly on top with the same
    // shape and the same color, so this has no visual effect beyond
    // fixing that Android artifact.
    backgroundColor: colors.claySurface,
  },
  inner: {
    // Always fills whatever box the Wrapper resolves to — sizing itself
    // (width/height/flex/margin) is handled by the Wrapper above via
    // layoutStyle, so this View never needs its own percentage width.
    width: '100%',
    borderRadius: radius.lg,
    backgroundColor: colors.claySurface,
    overflow: 'hidden',
    position: 'relative',
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 14,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
});
