import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clientsTable, usersTable, branchesTable, productsTable, activityLogTable } from "@workspace/db";
import { eq, and, sql, gte } from "drizzle-orm";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const user = req.user!;
  const branchScoped = user.role === "branch_head" && user.branchId;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const branchFilter = branchScoped ? eq(clientsTable.branchId, user.branchId!) : undefined;

  const [totalClients] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable).where(branchFilter);
  const [totalActiveClients] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(branchScoped ? and(branchFilter, sql`status NOT IN ('completed', 'rejected')`) : sql`status NOT IN ('completed', 'rejected')`);
  const [completedToday] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(branchScoped ? and(branchFilter, eq(clientsTable.status, "completed"), gte(clientsTable.updatedAt, startOfDay)) : and(eq(clientsTable.status, "completed"), gte(clientsTable.updatedAt, startOfDay)));
  const [totalBranches] = await db.select({ count: sql<number>`count(*)::int` }).from(branchesTable)
    .where(branchScoped ? and(eq(branchesTable.isActive, true), eq(branchesTable.id, user.branchId!)) : eq(branchesTable.isActive, true));
  const [totalHunters] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable)
    .where(branchScoped
      ? and(eq(usersTable.branchId, user.branchId!), eq(usersTable.role, "hunter"), eq(usersTable.isActive, true))
      : and(eq(usersTable.role, "hunter"), eq(usersTable.isActive, true)));
  const [totalProducts] = await db.select({ count: sql<number>`count(*)::int` }).from(productsTable).where(eq(productsTable.isActive, true));
  const [completedMonth] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(branchScoped ? and(branchFilter, eq(clientsTable.status, "completed"), gte(clientsTable.updatedAt, startOfMonth)) : and(eq(clientsTable.status, "completed"), gte(clientsTable.updatedAt, startOfMonth)));
  const [rejectedMonth] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(branchScoped ? and(branchFilter, eq(clientsTable.status, "rejected"), gte(clientsTable.updatedAt, startOfMonth)) : and(eq(clientsTable.status, "rejected"), gte(clientsTable.updatedAt, startOfMonth)));

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
  const branchFilter = user.role === "branch_head" && user.branchId
    ? and(eq(branchesTable.isActive, true), eq(branchesTable.id, user.branchId))
    : eq(branchesTable.isActive, true);

  const branches = await db.select().from(branchesTable).where(branchFilter);

  const stats = await Promise.all(branches.map(async (branch) => {
    const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable).where(eq(clientsTable.branchId, branch.id));
    const [completed] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
      .where(and(eq(clientsTable.branchId, branch.id), eq(clientsTable.status, "completed")));
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

  if (user.role === "branch_head" && user.branchId) {
    const rows = await db.select({
      status: clientsTable.status,
      count: sql<number>`count(*)::int`,
    }).from(clientsTable)
      .where(eq(clientsTable.branchId, user.branchId))
      .groupBy(clientsTable.status);
    res.json(rows);
    return;
  }

  const rows = await db.select({
    status: clientsTable.status,
    count: sql<number>`count(*)::int`,
  }).from(clientsTable).groupBy(clientsTable.status);

  res.json(rows);
});

export default router;
