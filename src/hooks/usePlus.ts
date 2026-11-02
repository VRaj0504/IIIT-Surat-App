import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { subscribeToPlus, subscribeToPlusAccess, isEntitled, PlusSub, PLUS_ENABLED } from "../firebase/plusService";

export function usePlus() {
  const { profile } = useAuth();
  const uid = profile?.uid;
  const [sub, setSub] = useState<PlusSub | null>(null);
  const [loading, setLoading] = useState(!!uid && PLUS_ENABLED);

  useEffect(() => {
    if (!uid || !PLUS_ENABLED) {
      setSub(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeToPlus(uid, (s) => {
      setSub(s);
      setLoading(false);
    });
  }, [uid]);

  return { sub, plus: PLUS_ENABLED && isEntitled(sub), loading };
}

export function usePlusAccess() {
  const { profile } = useAuth();
  const uid = profile?.uid;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!uid || !PLUS_ENABLED) {
      setOpen(false);
      return;
    }
    return subscribeToPlusAccess(uid, setOpen);
  }, [uid]);
  return open;
}
