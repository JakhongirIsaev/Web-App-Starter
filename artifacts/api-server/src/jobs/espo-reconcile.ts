import type { Task } from "graphile-worker";
import { db, clientsTable, espoReconciliationRunsTable } from "@workspace/db";
import { gte, and, lte } from "drizzle-orm";
import { getEspoClient } from "../integrations/espo/client";

/**
 * Phase D4: nightly reconcile between local clients and Espo leads.
 *
 * Pulls Espo leads created in the last 24h, diffs against local clients
 * created in the same window, and records discrepancies in
 * espo_reconciliation_runs so admins can audit payout-relevant deltas.
 *
 * In stub mode the EspoClient returns []; the run still completes but
 * always reports zero discrepancies — that's correct until live creds
 * are configured.
 */
export const espoReconcile: Task = async (_payload, helpers) => {
  const now = new Date();
  const windowFrom = new Date(now);
  windowFrom.setHours(windowFrom.getHours() - 24);

  const espo = getEspoClient();

  let espoLeads;
  try {
    espoLeads = await espo.listRecentLeads(windowFrom);
  } catch (err) {
    helpers.logger.error(`espo-reconcile: listRecentLeads failed: ${String(err)}`);
    await db.insert(espoReconciliationRunsTable).values({
      windowFrom,
      windowTo: now,
      espoLeadCount: 0,
      localLeadCount: 0,
      missingInEspo: [],
      missingInLocal: [],
      notes: `failed: ${String(err)}`,
    });
    return;
  }

  const localLeads = await db
    .select({
      id: clientsTable.id,
      externalUuid: clientsTable.externalUuid,
      espoLeadId: clientsTable.espoLeadId,
      createdAt: clientsTable.createdAt,
    })
    .from(clientsTable)
    .where(and(gte(clientsTable.createdAt, windowFrom), lte(clientsTable.createdAt, now)));

  const localByUuid = new Map(localLeads.map((l) => [l.externalUuid, l]));
  const espoByUuid = new Map(
    espoLeads.filter((e) => e.cLocalLeadUuid).map((e) => [e.cLocalLeadUuid as string, e]),
  );

  // Missing in Espo: local leads whose externalUuid isn't in espoByUuid
  const missingInEspo = localLeads
    .filter((l) => !espoByUuid.has(l.externalUuid))
    .map((l) => ({ clientId: l.id, externalUuid: l.externalUuid, espoLeadId: l.espoLeadId }));

  // Missing in local: Espo leads whose cLocalLeadUuid doesn't appear locally
  const missingInLocal = espoLeads
    .filter((e) => e.cLocalLeadUuid && !localByUuid.has(e.cLocalLeadUuid))
    .map((e) => ({ espoLeadId: e.id, cLocalLeadUuid: e.cLocalLeadUuid }));

  const [run] = await db
    .insert(espoReconciliationRunsTable)
    .values({
      windowFrom,
      windowTo: now,
      espoLeadCount: espoLeads.length,
      localLeadCount: localLeads.length,
      missingInEspo,
      missingInLocal,
      notes: null,
    })
    .returning();

  helpers.logger.info(
    `espo-reconcile: window=${windowFrom.toISOString()}..${now.toISOString()} ` +
      `espo=${espoLeads.length} local=${localLeads.length} ` +
      `missingInEspo=${missingInEspo.length} missingInLocal=${missingInLocal.length} runId=${run.id}`,
  );
};
