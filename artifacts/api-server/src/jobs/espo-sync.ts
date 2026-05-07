import type { Task } from "graphile-worker";
import { db, clientsTable, espoSyncJobsTable, branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getEspoClient } from "../integrations/espo/client";
import { clientToEspoLead } from "../integrations/espo/payload";

interface Payload {
  jobId: number;
}

export const espoSync: Task = async (payload, helpers) => {
  const { jobId } = payload as Payload;
  const [job] = await db
    .select()
    .from(espoSyncJobsTable)
    .where(eq(espoSyncJobsTable.id, jobId));
  if (!job || job.status === "succeeded") return;

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, job.clientId));
  if (!client) {
    await db
      .update(espoSyncJobsTable)
      .set({
        status: "failed",
        lastError: "client_not_found",
        attempts: job.attempts + 1,
        updatedAt: new Date(),
      })
      .where(eq(espoSyncJobsTable.id, jobId));
    return;
  }

  const [branch] = client.branchId
    ? await db.select().from(branchesTable).where(eq(branchesTable.id, client.branchId))
    : [null];

  const espo = getEspoClient();

  try {
    // Idempotency: check if Espo already has this lead by local UUID
    const existing = await espo.findLeadByLocalUuid(client.externalUuid);
    let espoLead;
    if (existing) {
      espoLead = existing;
    } else {
      const leadPayload = clientToEspoLead({
        fullName: client.fullName,
        phone: client.phone,
        externalUuid: client.externalUuid,
        legalName: client.legalName,
        gender: client.gender,
        preferredLanguage: client.preferredLanguage,
        clientType: client.clientType,
        clientSegment: client.clientSegment,
        latitude: client.latitude,
        longitude: client.longitude,
        purpose: client.purpose,
        desiredAmountUzs: client.desiredAmountUzs,
        desiredTermMonths: client.desiredTermMonths,
        preferredCurrency: client.preferredCurrency,
        branch: branch ? { name: branch.name } : null,
        createdAt: client.createdAt,
      });
      espoLead = await espo.createLead(leadPayload, client.externalUuid);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(clientsTable)
        .set({
          espoLeadId: espoLead.id,
          espoSyncedAt: new Date(),
          espoLastError: null,
        })
        .where(eq(clientsTable.id, client.id));
      await tx
        .update(espoSyncJobsTable)
        .set({
          status: "succeeded",
          attempts: job.attempts + 1,
          espoLeadId: espoLead.id,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(espoSyncJobsTable.id, jobId));
    });

    helpers.logger.info(`espo synced client=${client.id} lead=${espoLead.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(espoSyncJobsTable)
      .set({
        attempts: job.attempts + 1,
        lastError: message,
        updatedAt: new Date(),
      })
      .where(eq(espoSyncJobsTable.id, jobId));

    // Also surface latest error on the client row for admin visibility
    await db
      .update(clientsTable)
      .set({
        espoLastError: message,
      })
      .where(eq(clientsTable.id, client.id));

    // Re-throw so graphile-worker handles retry/backoff via its own machinery
    throw err;
  }
};
