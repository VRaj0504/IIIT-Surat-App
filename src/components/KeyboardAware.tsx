import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  type FlatListProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from "react-native";

const GAP = 24;

function useKeyboardAware(scrollTo: (y: number) => void) {
  const offset = useRef(0);
  const kbRef = useRef(0);
  const kbTop = useRef(0);
  const [kb, setKb] = useState(0);

  const reveal = useCallback(() => {
    if (!kbRef.current) return;
    const input: any = (TextInput as any).State?.currentlyFocusedInput?.();
    if (!input?.measureInWindow) return;
    input.measureInWindow((_x: number, y: number, _w: number, h: number) => {

      const fromHeight = Dimensions.get("window").height - kbRef.current;
      const visibleBottom = Math.min(kbTop.current || fromHeight, fromHeight) - GAP;
      const overlap = y + h - visibleBottom;
      if (overlap > 0) scrollTo(offset.current + overlap);
    });
  }, [scrollTo]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => {
      kbRef.current = e.endCoordinates.height;
      kbTop.current = e.endCoordinates.screenY;
      setKb(e.endCoordinates.height);
      setTimeout(reveal, Platform.OS === "ios" ? 260 : 80);
    });
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => {
      kbRef.current = 0;
      kbTop.current = 0;
      setKb(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [reveal]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  };

  const onTouchEnd = () => {
    if (kbRef.current) setTimeout(reveal, 250);
  };
  return { kb, onScroll, onTouchEnd };
}

function withBottomRoom(style: any, kb: number) {
  if (!kb) return style;
  const base = StyleSheet.flatten(style) ?? {};
  const pb = typeof base.paddingBottom === "number" ? base.paddingBottom : typeof base.paddingVertical === "number" ? base.paddingVertical : typeof base.padding === "number" ? base.padding : 0;
  return [style, { paddingBottom: pb + kb }];
}

export const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardAwareScrollView(
  { contentContainerStyle, onScroll, onTouchEnd, ...rest },
  ref,
) {
  const inner = useRef<ScrollView>(null);
  useImperativeHandle(ref, () => inner.current as ScrollView);
  const k = useKeyboardAware(useCallback((y: number) => inner.current?.scrollTo({ y, animated: true }), []));
  return (
    <ScrollView
      ref={inner}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      {...rest}
      contentContainerStyle={withBottomRoom(contentContainerStyle, k.kb)}
      onScroll={(e) => {
        k.onScroll(e);
        onScroll?.(e);
      }}
      onTouchEnd={(e) => {
        k.onTouchEnd();
        onTouchEnd?.(e);
      }}
    />
  );
});

function KeyboardAwareFlatListInner<T>(
  { contentContainerStyle, onScroll, onTouchEnd, ...rest }: FlatListProps<T>,
  ref: React.ForwardedRef<FlatList<T>>,
) {
  const inner = useRef<FlatList<T>>(null);
  useImperativeHandle(ref, () => inner.current as FlatList<T>);
  const k = useKeyboardAware(useCallback((y: number) => inner.current?.scrollToOffset({ offset: y, animated: true }), []));
  return (
    <FlatList
      ref={inner}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      {...rest}
      contentContainerStyle={withBottomRoom(contentContainerStyle, k.kb)}
      onScroll={(e) => {
        k.onScroll(e);
        onScroll?.(e);
      }}
      onTouchEnd={(e) => {
        k.onTouchEnd();
        onTouchEnd?.(e);
      }}
    />
  );
}

export const KeyboardAwareFlatList = forwardRef(KeyboardAwareFlatListInner) as <T>(
  props: FlatListProps<T> & { ref?: React.ForwardedRef<FlatList<T>> },
) => React.ReactElement;
