import { useState, useEffect } from "react";

/* ─────────────────────────────────────────────────────────────
 * Phase D1 — online/offline state hook.
 *
 * Returns true when the browser believes it has a network. Used
 * by the offline badge and by postOrQueue to decide whether to
 * try the network or go straight to the IndexedDB queue.
 * ──────────────────────────────────────────────────────────── */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
