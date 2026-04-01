import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clientsTable, usersTable, branchesTable, productsTable, activityLogTable } from "@workspace/db";
import { eq, and, sql, gte } from "drizzle-orm";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalClients] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable);
  const [totalActiveClients] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(sql`status NOT IN ('completed', 'rejected')`);
  const [completedToday] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(and(eq(clientsTable.status, "completed"), gte(clientsTable.updatedAt, startOfDay)));
  const [totalBranches] = await db.select({ count: sql<number>`count(*)::int` }).from(branchesTable).where(eq(branchesTable.isActive, true));
  const [totalHunters] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable)
    .where(and(eq(usersTable.role, "hunter"), eq(usersTable.isActive, true)));
  const [totalProducts] = await db.select({ count: sql<number>`count(*)::int` }).from(productsTable).where(eq(productsTable.isActive, true));
  const [completedMonth] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(and(eq(clientsTable.status, "completed"), gte(clientsTable.updatedAt, startOfMonth)));
  const [rejectedMonth] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable)
    .where(and(eq(clientsTable.status, "rejected"), gte(clientsTable.updatedAt, startOfMonth)));

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

router.get("/dashboard/activity", async (req, res) => {
  const params = GetRecentActivityQueryParams.safeParse(req.query);
  const limit = params.success && params.data.limit ? params.data.limit : 20;

  const activities = await db.select().from(activityLogTable)
    .orderBy(sql`${activityLogTable.createdAt} desc`)
    .limit(limit);

  res.json(activities);
});

router.get("/dashboard/branch-stats", async (_req, res) => {
  const branches = await db.select().from(branchesTable).where(eq(branchesTable.isActive, true));

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

router.get("/dashboard/client-status", async (_req, res) => {
  const rows = await db.select({
    status: clientsTable.status,
    count: sql<number>`count(*)::int`,
  }).from(clientsTable).groupBy(clientsTable.status);

  res.json(rows);
});

export default router;
