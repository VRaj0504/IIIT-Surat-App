import React, { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

// Draws something above the whole app — tab bar included — without using
// React Native's <Modal>.
//
// Why: on Android 15 (edge-to-edge) a translucent <Modal> lays its content out
// shorter than the screen, so a bottom sheet stopped above the floating tab
// bar and the tab bar stayed visible and un-dimmed under it. Content shown
// through <Portal> lives in the app's own full-screen window instead, so a
// sheet always reaches the bottom edge of the phone.

type Api = { set: (key: string, node: React.ReactNode | null) => void };
const PortalContext = createContext<Api | null>(null);

export function PortalHost({ children }: { children: React.ReactNode }) {
  const [nodes, setNodes] = useState<Record<string, React.ReactNode>>({});
  const set = useCallback((key: string, node: React.ReactNode | null) => {
    setNodes((prev) => {
      if (node === null) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: node };
    });
  }, []);
  const api = useMemo(() => ({ set }), [set]);
  const keys = Object.keys(nodes);
  return (
    <PortalContext.Provider value={api}>
      {children}
      {keys.length > 0 && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {keys.map((k) => (
            <React.Fragment key={k}>{nodes[k]}</React.Fragment>
          ))}
        </View>
      )}
    </PortalContext.Provider>
  );
}

export function Portal({ children }: { children: React.ReactNode }) {
  const ctx = useContext(PortalContext);
  const key = useId();
  useLayoutEffect(() => {
    ctx?.set(key, children);
  }, [ctx, key, children]);
  useLayoutEffect(() => () => ctx?.set(key, null), [ctx, key]);
  // No host (shouldn't happen): draw in place rather than not at all.
  return ctx ? null : <>{children}</>;
}
