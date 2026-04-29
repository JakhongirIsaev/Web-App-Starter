import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clientsTable, usersTable, branchesTable, productsTable, activityLogTable, clientNextActionsTable } from "@workspace/db";
import { eq, and, sql, gte, lte, desc, inArray, count } from "drizzle-orm";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middleware/auth";
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

// Paginated, filterable admin audit view of activity_log. Reads
// metadata jsonb so payloads (before/after, counts, IDs) come through.
router.get("/admin/activity-log", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));

  const conditions: any[] = [];

  if (typeof req.query.type === "string" && req.query.type.length > 0) {
    const types = req.query.type.split(",").map((s) => s.trim()).filter(Boolean);
    if (types.length > 0) conditions.push(inArray(activityLogTable.type, types));
  }
  if (typeof req.query.userId === "string" && req.query.userId.length > 0) {
    const userId = Number(req.query.userId);
    if (Number.isInteger(userId) && userId > 0) {
      conditions.push(eq(activityLogTable.userId, userId));
    }
  }
  if (typeof req.query.branchName === "string" && req.query.branchName.length > 0) {
    conditions.push(eq(activityLogTable.branchName, req.query.branchName));
  }
  if (typeof req.query.entityType === "string" && req.query.entityType.length > 0) {
    conditions.push(eq(activityLogTable.entityType, req.query.entityType));
  }
  if (typeof req.query.from === "string" && req.query.from.length > 0) {
    const fromDate = new Date(req.query.from);
    if (!Number.isNaN(fromDate.getTime())) conditions.push(gte(activityLogTable.createdAt, fromDate));
  }
  if (typeof req.query.to === "string" && req.query.to.length > 0) {
    const toDate = new Date(req.query.to);
    if (!Number.isNaN(toDate.getTime())) conditions.push(lte(activityLogTable.createdAt, toDate));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(activityLogTable)
    .where(where);

  const data = await db
    .select()
    .from(activityLogTable)
    .where(where)
    .orderBy(desc(activityLogTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({ data, total, page, pageSize });
});

// Distinct event types currently in the log — fuels the filter dropdown.
router.get("/admin/activity-log/types", requireAuth, requireRole("superadmin", "head_office_admin"), async (_req, res) => {
  const rows = await db
    .selectDistinct({ type: activityLogTable.type })
    .from(activityLogTable)
    .orderBy(activityLogTable.type);
  res.json(rows.map((r) => r.type));
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
