import { listQueued, dequeue } from "./offline-queue";
import { api } from "./api";

/* ─────────────────────────────────────────────────────────────
 * Phase D1 — drain the offline queue.
 *
 * Iterates queued saves and POSTs each one. On success the item
 * is dequeued; on failure it stays — drainQueue will retry it
 * the next time it's called (next "online" event or app launch).
 *
 * Best-effort: errors are logged to console but not surfaced.
 * The OfflineBadge polls queueSize() so the count refreshes
 * automatically.
 * ──────────────────────────────────────────────────────────── */
export async function drainQueue(): Promise<{
  succeeded: number;
  failed: number;
}> {
  const items = await listQueued();
  let succeeded = 0;
  let failed = 0;
  for (const it of items) {
    try {
      await api.post(it.endpoint, it.body);
      await dequeue(it.uuid);
      succeeded++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`drainQueue: ${it.uuid} failed:`, err);
      failed++;
      // Don't dequeue on failure — try again next time.
    }
  }
  return { succeeded, failed };
}
