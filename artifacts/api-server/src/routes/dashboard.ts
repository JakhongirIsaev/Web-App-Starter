import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  clientsTable,
  usersTable,
  branchesTable,
  productsTable,
  activityLogTable,
  questionnaireSessionsTable,
  questionnaireAnswersTable,
} from "@workspace/db";
import { eq, and, sql, gte, lte, type SQLWrapper } from "drizzle-orm";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const validClientTypes = new Set(["individual", "legal"]);
const validSegments = new Set(["micro", "small", "medium"]);
const validGenders = new Set(["male", "female"]);

function parseDateBoundary(value: string | undefined, endOfDay = false) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }
  return parsed;
}

function parseDashboardFilters(
  user: { role: string; branchId: number | null },
  query: Record<string, unknown>,
) {
  const requestedBranchId = Number(query.branchId);
  const branchId =
    user.role === "branch_head"
      ? user.branchId
      : Number.isFinite(requestedBranchId) && requestedBranchId > 0
        ? requestedBranchId
        : null;

  const clientType = typeof query.clientType === "string" && validClientTypes.has(query.clientType)
    ? query.clientType
    : null;
  const segment = typeof query.segment === "string" && validSegments.has(query.segment)
    ? query.segment
    : null;
  const gender = typeof query.gender === "string" && validGenders.has(query.gender)
    ? query.gender
    : null;

  return {
    branchId,
    clientType,
    segment,
    gender,
    createdFrom: parseDateBoundary(typeof query.createdFrom === "string" ? query.createdFrom : undefined),
    createdTo: parseDateBoundary(typeof query.createdTo === "string" ? query.createdTo : undefined, true),
  };
}

function profileAnswerCondition(questionKey: string, value: string) {
  return sql`exists (
    select 1
    from ${questionnaireAnswersTable}
    inner join ${questionnaireSessionsTable}
      on ${questionnaireAnswersTable.sessionId} = ${questionnaireSessionsTable.id}
    where ${questionnaireSessionsTable.clientId} = ${clientsTable.id}
      and ${questionnaireAnswersTable.questionKey} = ${questionKey}
      and ${questionnaireAnswersTable.answer} = ${value}
  )`;
}

function buildClientConditions(
  filters: ReturnType<typeof parseDashboardFilters>,
  branchIdOverride?: number | null,
) {
  const conditions: SQLWrapper[] = [];
  const effectiveBranchId = branchIdOverride ?? filters.branchId;

  if (effectiveBranchId) {
    conditions.push(eq(clientsTable.branchId, effectiveBranchId));
  }
  if (filters.createdFrom) {
    conditions.push(gte(clientsTable.createdAt, filters.createdFrom));
  }
  if (filters.createdTo) {
    conditions.push(lte(clientsTable.createdAt, filters.createdTo));
  }
  if (filters.gender) {
    conditions.push(eq(clientsTable.gender, filters.gender));
  }
  if (filters.clientType) {
    conditions.push(profileAnswerCondition("client_type", filters.clientType));
  }
  if (filters.segment) {
    conditions.push(profileAnswerCondition("business_size", filters.segment));
  }

  return conditions;
}

function buildBranchConditions(
  user: { role: string; branchId: number | null },
  filters: ReturnType<typeof parseDashboardFilters>,
) {
  const conditions: SQLWrapper[] = [eq(branchesTable.isActive, true)];

  if (user.role === "branch_head" && user.branchId) {
    conditions.push(eq(branchesTable.id, user.branchId));
  } else if (filters.branchId) {
    conditions.push(eq(branchesTable.id, filters.branchId));
  }

  return conditions;
}

function combineConditions(conditions: SQLWrapper[]) {
  return conditions.length > 0 ? and(...conditions) : undefined;
}

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const user = req.user!;
  const filters = parseDashboardFilters(user, req.query as Record<string, unknown>);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const baseClientConditions = buildClientConditions(filters);
  const branchConditions = buildBranchConditions(user, filters);

  const [totalClients] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable).where(combineConditions(baseClientConditions));
  const [totalActiveClients] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(combineConditions([...baseClientConditions, sql`${clientsTable.status} NOT IN ('completed', 'rejected')`]));
  const [completedToday] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(combineConditions([...baseClientConditions, eq(clientsTable.status, "completed"), gte(clientsTable.updatedAt, startOfDay)]));
  const [totalBranches] = await db.select({ count: sql<number>`count(*)::int` }).from(branchesTable)
    .where(combineConditions(branchConditions));
  const [totalHunters] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable)
    .where(combineConditions([
      eq(usersTable.role, "hunter"),
      eq(usersTable.isActive, true),
      ...(filters.branchId ? [eq(usersTable.branchId, filters.branchId)] : []),
    ]));
  const [totalProducts] = await db.select({ count: sql<number>`count(*)::int` }).from(productsTable).where(eq(productsTable.isActive, true));
  const [completedMonth] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(combineConditions([...baseClientConditions, eq(clientsTable.status, "completed"), gte(clientsTable.updatedAt, startOfMonth)]));
  const [rejectedMonth] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(combineConditions([...baseClientConditions, eq(clientsTable.status, "rejected"), gte(clientsTable.updatedAt, startOfMonth)]));

  res.json({
    totalClients: totalClients?.count ?? 0,
    totalActiveClients: totalActiveClients?.count ?? 0,
    totalCompletedToday: completedToday?.count ?? 0,
    totalBranches: totalBranches?.count ?? 0,
    totalHunters: totalHunters?.count ?? 0,
    totalProducts: totalProducts?.count ?? 0,
    completedThisMonth: completedMonth?.count ?? 0,
    rejectedThisMonth: rejectedMonth?.count ?? 0,
  });
});

router.get("/dashboard/activity", requireAuth, async (req, res) => {
  const user = req.user!;
  const params = GetRecentActivityQueryParams.safeParse(req.query);
  const limit = params.success && params.data.limit ? params.data.limit : 20;

  let query = db.select().from(activityLogTable)
    .orderBy(sql`${activityLogTable.createdAt} desc`)
    .limit(limit);

  if (user.role === "branch_head" && user.branchId) {
    const branches = await db.select({ name: branchesTable.name }).from(branchesTable).where(eq(branchesTable.id, user.branchId)).limit(1);
    if (branches.length) {
      const activities = await db.select().from(activityLogTable)
        .where(eq(activityLogTable.branchName, branches[0].name))
        .orderBy(sql`${activityLogTable.createdAt} desc`)
        .limit(limit);
      res.json(activities);
      return;
    }
  }

  const activities = await query;
  res.json(activities);
});

router.get("/dashboard/branch-stats", requireAuth, async (req, res) => {
  const user = req.user!;
  const filters = parseDashboardFilters(user, req.query as Record<string, unknown>);

  const branches = await db.select().from(branchesTable).where(combineConditions(buildBranchConditions(user, filters)));

  const stats = await Promise.all(branches.map(async (branch) => {
    const scopedConditions = buildClientConditions(filters, branch.id);
    const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable).where(combineConditions(scopedConditions));
    const [completed] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
      .where(combineConditions([...scopedConditions, eq(clientsTable.status, "completed")]));
    const [hunters] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable)
      .where(and(eq(usersTable.branchId, branch.id), eq(usersTable.role, "hunter"), eq(usersTable.isActive, true)));

    return {
      branchId: branch.id,
      branchName: branch.name,
      totalClients: total?.count ?? 0,
      completedClients: completed?.count ?? 0,
      activeHunters: hunters?.count ?? 0,
    };
  }));

  res.json(stats);
});

router.get("/dashboard/client-status", requireAuth, async (req, res) => {
  const user = req.user!;
  const filters = parseDashboardFilters(user, req.query as Record<string, unknown>);

  const rows = await db.select({
    status: clientsTable.status,
    count: sql<number>`count(*)::int`,
  }).from(clientsTable)
    .where(combineConditions(buildClientConditions(filters)))
    .groupBy(clientsTable.status);

  res.json(rows);
});

export default router;
