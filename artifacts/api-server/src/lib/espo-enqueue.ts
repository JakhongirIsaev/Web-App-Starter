import { db, espoSyncJobsTable, pool } from "@workspace/db";
import { quickAddJob } from "graphile-worker";

interface EnqueueArgs {
  clientId: number;
  externalUuid: string;
}

/**
 * Insert an espo_sync_jobs row and best-effort enqueue a graphile-worker job.
 *
 * Failure to enqueue is non-fatal: the job row is persisted regardless, so a
 * polling worker (or a follow-up enqueue) can still process it. We never let a
 * queue hiccup fail the user-facing client save.
 */
export async function enqueueEspoSync({ clientId, externalUuid }: EnqueueArgs): Promise<void> {
  let jobId: number;
  try {
    const [job] = await db
      .insert(espoSyncJobsTable)
      .values({
        clientId,
        idempotencyKey: externalUuid,
      })
      .returning({ id: espoSyncJobsTable.id });
    jobId = job.id;
  } catch (err) {
    console.error("espo enqueue: failed to insert job row (non-fatal):", err);
    return;
  }

  try {
    await quickAddJob(
      { pgPool: pool },
      "espo-sync",
      { jobId },
      { jobKey: `espo-${externalUuid}`, maxAttempts: 10 },
    );
  } catch (err) {
    // Don't fail the user save — the worker will still pick up the row via
    // polling even if quickAddJob couldn't reach the queue right now.
    console.error("espo enqueue: quickAddJob failed (non-fatal):", err);
  }
}
