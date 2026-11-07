import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { subscribeToInbox } from "../firebase/inboxService";

export function useInboxUnread(): number {
  const { profile } = useAuth();
  const uid = profile?.uid;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid) {
      setCount(0);
      return;
    }
    return subscribeToInbox(uid, (items) => setCount(items.filter((i) => !i.read).length), () => setCount(0));
  }, [uid]);

  return count;
}
