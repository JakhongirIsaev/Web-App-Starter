import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type DbModule = typeof import("@workspace/db");

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const allClients = args.has("--all-clients");
const skipBackup = args.has("--no-backup");
const forceLarge = args.has("--force-large");

if (!allClients) {
  console.error(
    "Refusing to run without --all-clients. This script is intentionally scoped to a full client/application reset.",
  );
  process.exit(1);
}

if (process.env.DATABASE_PUBLIC_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

async function loadDb(): Promise<DbModule> {
  return import("@workspace/db");
}

async function queryRows(pool: DbModule["pool"], sql: string, params: unknown[] = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function count(pool: DbModule["pool"], sql: string, params: unknown[] = []) {
  const result = await pool.query<{ count: string }>(sql, params);
  return Number(result.rows[0]?.count ?? 0);
}

async function main() {
  const { pool } = await loadDb();

  const clients = await queryRows(
    pool,
    `
      select id, full_name, phone, status, branch_id, assigned_to_id, created_at, updated_at
      from clients
      order by updated_at desc, id desc
    `,
  );
  const clientIds = clients.map((client) => client.id);

  if (clientIds.length === 0) {
    console.log("No clients found. Nothing to clean.");
    await pool.end();
    return;
  }

  if (clientIds.length > 100 && apply && !forceLarge) {
    console.error(
      `Refusing to delete ${clientIds.length} clients without --force-large. Re-run only if this is expected.`,
    );
    await pool.end();
    process.exit(1);
  }

  const summary = {
    clients: clientIds.length,
    clientNotes: await count(pool, "select count(*) from client_notes where client_id = any($1::int[])", [clientIds]),
    clientNextActions: await count(pool, "select count(*) from client_next_actions where client_id = any($1::int[])", [
      clientIds,
    ]),
    questionnaireSessions: await count(pool, "select count(*) from questionnaire_sessions where client_id = any($1::int[])", [
      clientIds,
    ]),
    questionnaireAnswers: await count(
      pool,
      `
        select count(*)
        from questionnaire_answers
        where session_id in (select id from questionnaire_sessions where client_id = any($1::int[]))
      `,
      [clientIds],
    ),
    baskets: await count(pool, "select count(*) from baskets where client_id = any($1::int[])", [clientIds]),
    basketItems: await count(
      pool,
      `
        select count(*)
        from basket_items
        where basket_id in (select id from baskets where client_id = any($1::int[]))
      `,
      [clientIds],
    ),
    calculations: await count(pool, "select count(*) from calculations where client_id = any($1::int[])", [clientIds]),
    clientDocuments: await count(pool, "select count(*) from client_documents where client_id = any($1::int[])", [
      clientIds,
    ]),
    collateralItems: await count(pool, "select count(*) from collateral_items where client_id = any($1::int[])", [
      clientIds,
    ]),
    collateralEstimates: await count(pool, "select count(*) from collateral_estimates where client_id = any($1::int[])", [
      clientIds,
    ]),
    collateralEstimateItems: await count(
      pool,
      `
        select count(*)
        from collateral_estimate_items
        where estimate_id in (select id from collateral_estimates where client_id = any($1::int[]))
      `,
      [clientIds],
    ),
    clientActivityLogs: await count(
      pool,
      "select count(*) from activity_log where entity_type = 'client' and entity_id = any($1::int[])",
      [clientIds],
    ),
  };

  console.log(apply ? "Apply mode: client workflow data will be deleted." : "Dry run: no data will be deleted.");
  console.table(summary);
  console.log("Client preview:");
  console.table(
    clients.slice(0, 30).map((client) => ({
      id: client.id,
      name: client.full_name,
      status: client.status,
      updatedAt: client.updated_at,
    })),
  );

  if (!apply) {
    console.log("Re-run with --apply --all-clients to delete these client/application rows.");
    await pool.end();
    return;
  }

  const backup = {
    createdAt: new Date().toISOString(),
    summary,
    clients,
    clientNotes: await queryRows(pool, "select * from client_notes where client_id = any($1::int[])", [clientIds]),
    clientNextActions: await queryRows(pool, "select * from client_next_actions where client_id = any($1::int[])", [
      clientIds,
    ]),
    questionnaireSessions: await queryRows(pool, "select * from questionnaire_sessions where client_id = any($1::int[])", [
      clientIds,
    ]),
    questionnaireAnswers: await queryRows(
      pool,
      `
        select *
        from questionnaire_answers
        where session_id in (select id from questionnaire_sessions where client_id = any($1::int[]))
      `,
      [clientIds],
    ),
    baskets: await queryRows(pool, "select * from baskets where client_id = any($1::int[])", [clientIds]),
    basketItems: await queryRows(
      pool,
      `
        select *
        from basket_items
        where basket_id in (select id from baskets where client_id = any($1::int[]))
      `,
      [clientIds],
    ),
    calculations: await queryRows(pool, "select * from calculations where client_id = any($1::int[])", [clientIds]),
    clientDocuments: await queryRows(pool, "select * from client_documents where client_id = any($1::int[])", [clientIds]),
    collateralItems: await queryRows(pool, "select * from collateral_items where client_id = any($1::int[])", [clientIds]),
    collateralEstimates: await queryRows(pool, "select * from collateral_estimates where client_id = any($1::int[])", [
      clientIds,
    ]),
    collateralEstimateItems: await queryRows(
      pool,
      `
        select *
        from collateral_estimate_items
        where estimate_id in (select id from collateral_estimates where client_id = any($1::int[]))
      `,
      [clientIds],
    ),
    clientActivityLogs: await queryRows(
      pool,
      "select * from activity_log where entity_type = 'client' and entity_id = any($1::int[])",
      [clientIds],
    ),
  };

  if (!skipBackup) {
    const backupDir = join(process.cwd(), "tmp", "ops-backups");
    await mkdir(backupDir, { recursive: true });
    const backupPath = join(backupDir, `client-workflow-cleanup-${timestamp}.json`);
    await writeFile(backupPath, JSON.stringify(backup, null, 2));
    console.log(`Backup written: ${backupPath}`);
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from activity_log where entity_type = 'client' and entity_id = any($1::int[])", [
      clientIds,
    ]);
    await client.query(
      `
        delete from collateral_estimate_items
        where estimate_id in (select id from collateral_estimates where client_id = any($1::int[]))
      `,
      [clientIds],
    );
    await client.query("delete from collateral_estimates where client_id = any($1::int[])", [clientIds]);
    await client.query("delete from collateral_items where client_id = any($1::int[])", [clientIds]);
    await client.query("delete from client_documents where client_id = any($1::int[])", [clientIds]);
    await client.query("delete from calculations where client_id = any($1::int[])", [clientIds]);
    await client.query(
      `
        delete from basket_items
        where basket_id in (select id from baskets where client_id = any($1::int[]))
      `,
      [clientIds],
    );
    await client.query("delete from baskets where client_id = any($1::int[])", [clientIds]);
    await client.query(
      `
        delete from questionnaire_answers
        where session_id in (select id from questionnaire_sessions where client_id = any($1::int[]))
      `,
      [clientIds],
    );
    await client.query("delete from questionnaire_sessions where client_id = any($1::int[])", [clientIds]);
    await client.query("delete from client_next_actions where client_id = any($1::int[])", [clientIds]);
    await client.query("delete from client_notes where client_id = any($1::int[])", [clientIds]);
    await client.query("delete from clients where id = any($1::int[])", [clientIds]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  const remainingClients = await count(pool, "select count(*) from clients");
  const remainingOpenActions = await count(pool, "select count(*) from client_next_actions where is_completed = false");
  console.log(`Cleanup complete. Remaining clients: ${remainingClients}. Remaining open actions: ${remainingOpenActions}.`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
