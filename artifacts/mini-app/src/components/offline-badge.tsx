import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { CloudOff, RefreshCw } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online";
import { queueSize } from "@/lib/offline-queue";
import { drainQueue } from "@/lib/sync-runner";

/* ─────────────────────────────────────────────────────────────
 * Phase D1 — Offline badge.
 *
 * Mounts at the top of the mini-app shell (above the bottom nav)
 * and only renders when there's something to say:
 *   - offline (regardless of queue): show "Offline" / "Не в сети"
 *   - online + queue not empty: show "Sync: N" while drainer runs
 *
 * We poll queueSize() every 5s through React Query — the drainer
 * runs on the "online" event and on app launch, so the count
 * goes to zero on its own and the badge then unmounts.
 *
 * Also wires up auto-drain on reconnect / mount. We do this here
 * rather than in App.tsx so the offline subsystem stays
 * self-contained — drop <OfflineBadge /> into a layout and you
 * get queue + sync + visual indicator together.
 * ──────────────────────────────────────────────────────────── */
export default function OfflineBadge() {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const { data: pending = 0, refetch } = useQuery({
    queryKey: ["offline-queue-size"],
    queryFn: () => queueSize(),
    refetchInterval: 5000,
  });

  // Drain on reconnect and on mount (catches the case where the
  // user closed the app while items were queued and reopened it
  // already-online).
  useEffect(() => {
    let cancelled = false;
    const tryDrain = async () => {
      try {
        await drainQueue();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("OfflineBadge drainQueue failed:", err);
      }
      if (!cancelled) refetch();
    };

    if (typeof navigator !== "undefined" && navigator.onLine) {
      tryDrain();
    }
    const onOnline = () => {
      tryDrain();
    };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [refetch]);

  if (online && pending === 0) return null;

  const labelOffline = t("offline.label");
  const labelSyncing = t("offline.syncing");
  const labelPending = t("offline.pendingCount", { count: pending });

  return (
    <div
      className="fixed top-2 left-2 z-50 px-3 py-1.5 rounded-full text-white text-[12px] font-semibold flex items-center gap-1.5 shadow-md"
      style={{ background: online ? "#0EA5E9" : "#F59E0B" }}
      role="status"
      aria-live="polite"
    >
      {online ? (
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <CloudOff className="w-3.5 h-3.5" />
      )}
      {online
        ? `${labelSyncing}: ${pending}`
        : pending > 0
          ? `${labelOffline} · ${labelPending}`
          : labelOffline}
    </div>
  );
}
