import React, { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

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

  return ctx ? null : <>{children}</>;
}
