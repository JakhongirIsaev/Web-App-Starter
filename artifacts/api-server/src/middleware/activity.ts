import { db } from "@workspace/db";
import { activityLogTable, branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthUser } from "./auth";

export async function logActivity(params: {
  type: string;
  description: string;
  entityId?: number;
  entityType?: string;
  user?: AuthUser | null;
  metadata?: Record<string, unknown> | null;
}) {
  let branchName: string | null = null;
  if (params.user?.branchId) {
    const branches = await db.select({ name: branchesTable.name }).from(branchesTable).where(eq(branchesTable.id, params.user.branchId)).limit(1);
    if (branches.length) branchName = branches[0].name;
  }

  await db.insert(activityLogTable).values({
    type: params.type,
    description: params.description,
    entityId: params.entityId ?? null,
    entityType: params.entityType ?? null,
    userId: params.user?.id ?? null,
    userName: params.user?.name ?? null,
    branchName,
    metadata: params.metadata ?? null,
  });
}
