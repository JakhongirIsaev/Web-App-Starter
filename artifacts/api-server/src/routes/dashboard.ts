import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clientsTable, usersTable, branchesTable, productsTable, activityLogTable, clientNextActionsTable } from "@workspace/db";
import { eq, and, sql, gte, lte, desc, inArray, count } from "drizzle-orm";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../middleware/auth";
import { startOfAppDay, startOfAppMonth } from "../lib/timezone";

const router: IRouter = Router();

function getClientFilters(req: any, user: any) {
  // Drizzle condition arrays are typed as SQL<unknown>[] — `any[]` is
  // intentional to allow heterogeneous filter conditions to accumulate
  // before being spread into `and()`.
  const conditions: any[] = [];
  if (user.role === "branch_head" && user.branchId) {
    conditions.push(eq(clientsTable.branchId, user.branchId));
  } else if (req.query.branchId) {
    conditions.push(eq(clientsTable.branchId, Number(req.query.branchId)));
  }

  // clientType & gender columns use pg enums; the query string is
  // validated at the DB level, so the `as any` cast is safe here.
  if (req.query.clientType) conditions.push(eq(clientsTable.clientType, req.query.clientType as any));
  if (req.query.clientSegment) conditions.push(eq(clientsTable.clientSegment, req.query.clientSegment as string));
  if (req.query.gender) conditions.push(eq(clientsTable.gender, req.query.gender as any));
  
  if (req.query.periodStart) conditions.push(gte(clientsTable.createdAt, new Date(req.query.periodStart as string)));
  if (req.query.periodEnd) conditions.push(lte(clientsTable.createdAt, new Date(req.query.periodEnd as string)));

  return conditions;
}

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const user = req.user!;
  const branchScoped = user.role === "branch_head" && user.branchId;
  const clientFilters = getClientFilters(req, user);

  const startOfDay = startOfAppDay();
  const startOfMonth = startOfAppMonth();

  const withClientFilters = (...extra: any[]) => {
    const filters = [...clientFilters, ...extra];
    return filters.length > 0 ? and(...filters) : undefined;
  };
  const selectedBranchId =
    branchScoped ? user.branchId! : req.query.branchId ? Number(req.query.branchId) : null;

  const [totalClients] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable).where(withClientFilters());
  const [totalActiveClients] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(withClientFilters(sql`status NOT IN ('completed', 'rejected')`));
  const [completedToday] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(withClientFilters(eq(clientsTable.status, "completed"), gte(clientsTable.updatedAt, startOfDay)));
  const [totalBranches] = await db.select({ count: sql<number>`count(*)::int` }).from(branchesTable)
    .where(selectedBranchId ? and(eq(branchesTable.isActive, true), eq(branchesTable.id, selectedBranchId)) : eq(branchesTable.isActive, true));
  const [totalHunters] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable)
    .where(selectedBranchId
      ? and(eq(usersTable.branchId, selectedBranchId), eq(usersTable.role, "hunter"), eq(usersTable.isActive, true))
      : and(eq(usersTable.role, "hunter"), eq(usersTable.isActive, true)));
  const [totalProducts] = await db.select({ count: sql<number>`count(*)::int` }).from(productsTable).where(eq(productsTable.isActive, true));
  const [completedMonth] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(withClientFilters(eq(clientsTable.status, "completed"), gte(clientsTable.updatedAt, startOfMonth)));
  const [rejectedMonth] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(withClientFilters(eq(clientsTable.status, "rejected"), gte(clientsTable.updatedAt, startOfMonth)));

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

  const query = db.select().from(activityLogTable)
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
  const branchFilter = user.role === "branch_head" && user.branchId
    ? and(eq(branchesTable.isActive, true), eq(branchesTable.id, user.branchId))
    : eq(branchesTable.isActive, true);

  const branches = await db.select().from(branchesTable).where(branchFilter);

  // Two aggregate queries instead of 3 per branch in Promise.all (N+1 fix)
  const branchIds = branches.map(b => b.id);

  const clientStats = branchIds.length > 0
    ? await db
        .select({
          branchId: clientsTable.branchId,
          total: count(),
          completed: sql<number>`count(*) filter (where ${clientsTable.status} = 'completed')`,
        })
        .from(clientsTable)
        .where(inArray(clientsTable.branchId, branchIds))
        .groupBy(clientsTable.branchId)
    : [];

  const hunterStats = branchIds.length > 0
    ? await db
        .select({
          branchId: usersTable.branchId,
          activeHunters: count(),
        })
        .from(usersTable)
        .where(and(
          inArray(usersTable.branchId, branchIds),
          eq(usersTable.role, "hunter"),
          eq(usersTable.isActive, true),
        ))
        .groupBy(usersTable.branchId)
    : [];

  const clientMap = new Map(clientStats.map(s => [s.branchId, s]));
  const hunterMap = new Map(hunterStats.map(s => [s.branchId, s]));

  const stats = branches.map(branch => ({
    branchId: branch.id,
    branchName: branch.name,
    totalClients: clientMap.get(branch.id)?.total ?? 0,
    completedClients: clientMap.get(branch.id)?.completed ?? 0,
    activeHunters: hunterMap.get(branch.id)?.activeHunters ?? 0,
  }));

  res.json(stats);
});

router.get("/dashboard/client-status", requireAuth, async (req, res) => {
  const user = req.user!;
  const conditions = getClientFilters(req, user);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db.select({
    status: clientsTable.status,
    count: sql<number>`count(*)::int`,
  }).from(clientsTable)
    .where(whereClause)
    .groupBy(clientsTable.status);

  res.json(rows);
});

router.get("/dashboard/rejection-reasons", requireAuth, async (req, res) => {
  const user = req.user!;
  const conditions = getClientFilters(req, user);
  conditions.push(eq(clientsTable.status, "rejected"));
  
  const rows = await db.select({
    reason: sql<string>`COALESCE(${clientsTable.rejectionReason}, 'Не указано')`,
    count: sql<number>`count(*)::int`,
  }).from(clientsTable)
    .where(and(...conditions))
    .groupBy(sql`COALESCE(${clientsTable.rejectionReason}, 'Не указано')`)
    .orderBy(desc(sql<number>`count(*)::int`));

  res.json(rows);
});

router.get("/dashboard/tasks", requireAuth, async (req, res) => {
  const user = req.user!;
  const now = new Date();
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const conditions = [
    eq(clientNextActionsTable.isCompleted, false),
    lte(clientNextActionsTable.actionDate, next24h),
  ];

  if (user.role === "branch_head" && user.branchId) {
    conditions.push(eq(clientsTable.branchId, user.branchId));
  }

  const tasks = await db
    .select({
      id: clientNextActionsTable.id,
      clientId: clientNextActionsTable.clientId,
      clientName: clientsTable.fullName,
      actionType: clientNextActionsTable.actionType,
      actionDate: clientNextActionsTable.actionDate,
      priority: clientNextActionsTable.priority,
      description: clientNextActionsTable.description,
    })
    .from(clientNextActionsTable)
    .innerJoin(clientsTable, eq(clientNextActionsTable.clientId, clientsTable.id))
    .where(and(...conditions))
    .orderBy(clientNextActionsTable.actionDate);

  res.json(tasks);
});

export default router;
