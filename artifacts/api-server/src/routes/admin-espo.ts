import { Router, type IRouter } from "express";
import { db, espoSyncJobsTable, pool } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { quickAddJob } from "graphile-worker";
import { guestAuth, requirePermission } from "../middleware/auth";

const router: IRouter = Router();

router.get(
  "/admin/espo-sync/jobs",
  guestAuth,
  requirePermission("espo.view_sync"),
  async (req, res) => {
    const status = String(req.query.status ?? "failed");
    const rows = await db
      .select()
      .from(espoSyncJobsTable)
      .where(eq(espoSyncJobsTable.status, status))
      .orderBy(desc(espoSyncJobsTable.updatedAt))
      .limit(100);
    res.json(rows);
  },
);

router.post(
  "/admin/espo-sync/retry/:id",
  guestAuth,
  requirePermission("espo.retry_sync"),
  async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isFinite(jobId)) {
      return res.status(400).json({ error: "invalid_id" });
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
      res.status(500).json({ error: "enqueue_failed", message });
    }
  },
);

export default router;
