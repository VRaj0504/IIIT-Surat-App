import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, Animated, PanResponder, Platform } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/theme';
import type { RootTabParamList } from './types';
import { useWebLayout } from '../utils/useWebLayout';

import HomeScreen from '../screens/HomeScreen';
import TimetableScreen from '../screens/TimetableScreen';
import NoticesScreen from '../screens/NoticesScreen';
import ClubsScreen from '../screens/ClubsScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();

const iconMap: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'home',
  Timetable: 'calendar',
  Notices: 'megaphone',
  Clubs: 'people',
  Profile: 'person',
};

export const TAB_BAR_SPACE = 110;

const BAR_HEIGHT = 64;
const ITEM_W = 52;
const LENS_W = 58;
const LENS_H = 48;
const LENS_OFFSET = (LENS_W - ITEM_W) / 2;

function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [xs, setXs] = useState<number[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(1)).current;
  const placed = useRef(false);
  const dragging = useRef(false);

  const xsRef = useRef<number[]>([]);
  const indexRef = useRef(state.index);
  const routesRef = useRef(state.routes);
  const hoverRef = useRef<number | null>(null);
  const startRef = useRef(0);
  xsRef.current = xs;
  indexRef.current = state.index;
  routesRef.current = state.routes;

  const go = (index: number) => {
    const route = routesRef.current[index];
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (index !== indexRef.current && !event.defaultPrevented) navigation.navigate(route.name as never);
  };

  useEffect(() => {
    const x = xs[state.index];
    if (x === undefined || dragging.current) return;
    if (!placed.current) {
      slide.setValue(x);
      placed.current = true;
      return;
    }
    Animated.parallel([
      Animated.spring(slide, { toValue: x, useNativeDriver: true, damping: 17, stiffness: 210, mass: 0.9 }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1.28, duration: 110, useNativeDriver: true }),
        Animated.spring(stretch, { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 260 }),
      ]),
    ]).start();
  }, [state.index, xs, slide, stretch]);

  const nearest = (x: number) => {
    const list = xsRef.current;
    let best = 0;
    list.forEach((v, i) => {
      if (Math.abs(v - x) < Math.abs(list[best] - x)) best = i;
    });
    return best;
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => {
          const list = xsRef.current;
          if (list.length === 0) return;
          dragging.current = true;
          startRef.current = list[indexRef.current] ?? list[0];
          hoverRef.current = indexRef.current;
          setHover(indexRef.current);
          Animated.spring(lift, { toValue: 1.14, useNativeDriver: true, damping: 12, stiffness: 240 }).start();
        },
        onPanResponderMove: (_e, g) => {
          const list = xsRef.current;
          if (list.length === 0) return;
          const min = Math.min(...list);
          const max = Math.max(...list);
          const x = Math.max(min - 6, Math.min(max + 6, startRef.current + g.dx));
          slide.setValue(x);
          const i = nearest(x);
          if (i !== hoverRef.current) {
            hoverRef.current = i;
            setHover(i);
          }
        },
        onPanResponderRelease: (_e, g) => {
          const target = nearest(startRef.current + g.dx);
          dragging.current = false;
          hoverRef.current = null;
          setHover(null);
          Animated.parallel([
            Animated.spring(lift, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 240 }),
            Animated.spring(slide, { toValue: xsRef.current[target] ?? 0, useNativeDriver: true, damping: 17, stiffness: 210 }),
          ]).start();
          go(target);
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
          hoverRef.current = null;
          setHover(null);
          Animated.parallel([
            Animated.spring(lift, { toValue: 1, useNativeDriver: true }),
            Animated.spring(slide, { toValue: xsRef.current[indexRef.current] ?? 0, useNativeDriver: true }),
          ]).start();
        },
      }),
    [],
  );

  const measured = xs[state.index] !== undefined;
  const lit = hover ?? state.index;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.shadow}>
        <View style={styles.glass} {...pan.panHandlers}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={60} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.androidGlass]} />
          )}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.sheen]} />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.lens,
              {
                opacity: measured ? 1 : 0,
                transform: [
                  { translateX: Animated.subtract(slide, LENS_OFFSET) },
                  { scaleX: Animated.multiply(stretch, lift) },
                  { scaleY: lift },
                ],
              },
            ]}
          />
          {state.routes.map((route, index) => {
            const focused = lit === index;
            const name = route.name as keyof RootTabParamList;
            return (
              <Pressable
                key={route.key}
                onPress={() => go(index)}
                accessibilityRole="tab"
                accessibilityState={{ selected: state.index === index }}
                accessibilityLabel={route.name}
                hitSlop={4}
                onLayout={(e) => {
                  const x = e.nativeEvent.layout.x;
                  setXs((prev) => {
                    if (prev[index] === x) return prev;
                    const next = [...prev];
                    next[index] = x;
                    return next;
                  });
                }}
                style={styles.item}
              >
                <Ionicons
                  name={focused ? iconMap[name] : (`${iconMap[name]}-outline` as keyof typeof Ionicons.glyphMap)}
                  size={23}
                  color={focused ? colors.ink : colors.inkMuted}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function TabNavigator() {

  const { isDesktop } = useWebLayout();
  return (
    <Tab.Navigator
      tabBar={(props) => (isDesktop ? null : <AppTabBar {...props} />)}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Timetable" component={TimetableScreen} />
      <Tab.Screen name="Notices" component={NoticesScreen} />
      <Tab.Screen name="Clubs" component={ClubsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'transparent', paddingTop: 8, paddingHorizontal: 20 },
  shadow: {
    borderRadius: 32,
    shadowColor: '#0B1220',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    backgroundColor: 'transparent',
  },
  glass: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: BAR_HEIGHT,
    borderRadius: 32,
    paddingHorizontal: 8,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  androidGlass: { backgroundColor: colors.ink },
  sheen: { backgroundColor: Platform.OS === 'ios' ? 'rgba(14,26,51,0.72)' : 'transparent' },
  lens: {
    position: 'absolute',
    top: (BAR_HEIGHT - LENS_H) / 2,
    left: 0,
    width: LENS_W,
    height: LENS_H,
    borderRadius: LENS_H / 2,
    backgroundColor: colors.onInk,
  },
  item: { width: ITEM_W, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
