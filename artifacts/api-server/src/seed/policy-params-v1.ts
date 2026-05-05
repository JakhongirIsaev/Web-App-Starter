import { db, policyParamVersionsTable } from "@workspace/db";
import { defaultPolicyParams } from "../lib/policy-params";
import { logger } from "../lib/logger";

// Idempotent: inserts the v1 (2026.05) policy-params row only if the table is
// empty. Safe to call on every boot. Pulls the values from
// defaultPolicyParams() so the seeded row always matches the in-code defaults.
export async function seedPolicyParamsV1(): Promise<void> {
  const existing = await db
    .select({ id: policyParamVersionsTable.id })
    .from(policyParamVersionsTable)
    .limit(1);
  if (existing.length > 0) {
    return; // already seeded
  }
  await db.insert(policyParamVersionsTable).values({
    version: "2026.05",
    effectiveFrom: new Date("2026-05-01T00:00:00Z"),
    effectiveTo: null,
    value: defaultPolicyParams(),
  });
  logger.info("seeded policy_param_versions v2026.05");
}
