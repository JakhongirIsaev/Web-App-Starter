import { Router, type IRouter } from "express";
import { badRequest } from "../lib/errors";
import { db, espoSyncJobsTable, espoReconciliationRunsTable, pool, clientsTable } from "@workspace/db";
import { eq, desc, count, inArray } from "drizzle-orm";
import { quickAddJob } from "graphile-worker";
import { guestAuth, requirePermission } from "../middleware/auth";
import { checkEspoHealth } from "../integrations/espo/client";

const router: IRouter = Router();

router.get(
  "/admin/espo-sync/health",
  guestAuth,
  requirePermission("espo.view_sync"),
  async (_req, res) => {
    const health = await checkEspoHealth();
    res.json(health);
  },
);

router.get(
  "/admin/espo-sync/jobs",
  guestAuth,
  requirePermission("espo.view_sync"),
  async (req, res) => {
    const status = String(req.query.status ?? "failed");
    const rows = await db
      .select({
        id: espoSyncJobsTable.id,
        clientId: espoSyncJobsTable.clientId,
        clientName: clientsTable.fullName,
        status: espoSyncJobsTable.status,
        attempts: espoSyncJobsTable.attempts,
        lastError: espoSyncJobsTable.lastError,
        espoLeadId: espoSyncJobsTable.espoLeadId,
        createdAt: espoSyncJobsTable.createdAt,
        updatedAt: espoSyncJobsTable.updatedAt,
      })
      .from(espoSyncJobsTable)
      .leftJoin(clientsTable, eq(espoSyncJobsTable.clientId, clientsTable.id))
      .where(eq(espoSyncJobsTable.status, status))
      .orderBy(desc(espoSyncJobsTable.updatedAt))
      .limit(100);
    res.json(rows);
  },
);

// Counts per status — drives admin dashboard cards without pulling all rows.
router.get(
  "/admin/espo-sync/stats",
  guestAuth,
  requirePermission("espo.view_sync"),
  async (_req, res) => {
    const rows = await db
      .select({ status: espoSyncJobsTable.status, n: count() })
      .from(espoSyncJobsTable)
      .groupBy(espoSyncJobsTable.status);
    const stats = { pending: 0, failed: 0, succeeded: 0, total: 0 };
    for (const r of rows) {
      const n = Number(r.n);
      if (r.status === "pending") stats.pending = n;
      else if (r.status === "failed") stats.failed = n;
      else if (r.status === "succeeded") stats.succeeded = n;
      stats.total += n;
    }
    res.json(stats);
  },
);

router.get(
  "/admin/espo-sync/reconciliation",
  guestAuth,
  requirePermission("espo.view_sync"),
  async (_req, res) => {
    const [latest] = await db
      .select()
      .from(espoReconciliationRunsTable)
      .orderBy(desc(espoReconciliationRunsTable.ranAt))
      .limit(1);
    if (!latest) {
      res.json(null);
      return;
    }
    res.json(latest);
  },
);

// Reconciliation history — last 30 runs.
router.get(
  "/admin/espo-sync/reconciliation/history",
  guestAuth,
  requirePermission("espo.view_sync"),
  async (_req, res) => {
    const rows = await db
      .select()
      .from(espoReconciliationRunsTable)
      .orderBy(desc(espoReconciliationRunsTable.ranAt))
      .limit(30);
    res.json(rows);
  },
);

// Manually trigger a reconciliation run. Cron schedules one nightly anyway —
// this just lets admins confirm immediately. Risk-free: it is the same task,
// just executed sooner.
router.post(
  "/admin/espo-sync/reconciliation/run",
  guestAuth,
  requirePermission("espo.retry_sync"),
  async (_req, res) => {
    try {
      await quickAddJob({ pgPool: pool }, "espo-reconcile", {}, { maxAttempts: 1 });
      res.json({ enqueued: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // SKIP(PR-E1): bespoke envelope ({error, message} top-level, no `details` field)
      res.status(500).json({ error: "enqueue_failed", message });
    }
  },
);

router.post(
  "/admin/espo-sync/retry/:id",
  guestAuth,
  requirePermission("espo.retry_sync"),
  async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isFinite(jobId)) {
      badRequest(res, "invalid_id");
      return;
    }
    try {
      // Reset job state so the worker picks it up cleanly on retry.
      await db
        .update(espoSyncJobsTable)
        .set({ status: "pending", lastError: null, updatedAt: new Date() })
        .where(eq(espoSyncJobsTable.id, jobId));

      await quickAddJob(
        { pgPool: pool },
        "espo-sync",
        { jobId },
        { maxAttempts: 1 },
      );
      res.json({ enqueued: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // SKIP(PR-E1): bespoke envelope ({error, message} top-level, no `details` field)
      res.status(500).json({ error: "enqueue_failed", message });
    }
  },
);

// Bulk retry: re-enqueue every failed job (capped at 200 per call).
router.post(
  "/admin/espo-sync/retry-all-failed",
  guestAuth,
  requirePermission("espo.retry_sync"),
  async (_req, res) => {
    const failed = await db
      .select({ id: espoSyncJobsTable.id })
      .from(espoSyncJobsTable)
      .where(eq(espoSyncJobsTable.status, "failed"))
      .limit(200);
    if (failed.length === 0) {
      res.json({ enqueued: 0 });
      return;
    }

    const ids = failed.map((r) => r.id);
    await db
      .update(espoSyncJobsTable)
      .set({ status: "pending", lastError: null, updatedAt: new Date() })
      .where(inArray(espoSyncJobsTable.id, ids));

    let enqueued = 0;
    for (const id of ids) {
      try {
        await quickAddJob({ pgPool: pool }, "espo-sync", { jobId: id }, { maxAttempts: 1 });
        enqueued++;
      } catch {
        // Continue — one bad enqueue shouldn't block the rest.
      }
    }
    res.json({ enqueued, total: ids.length });
  },
);

export default router;
