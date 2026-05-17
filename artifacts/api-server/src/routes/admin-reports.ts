import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, clientsTable } from "@workspace/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { guestAuth, requirePermission } from "../middleware/auth";

const router: IRouter = Router();

const FunnelQuery = z.object({
  branch: z.coerce.number().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  expert: z.coerce.number().optional(),
  source: z.string().optional(),
});

router.get(
  "/admin/reports/funnel",
  guestAuth,
  requirePermission("report.view_branch"),
  async (req, res) => {
    const params = FunnelQuery.safeParse(req.query);
    if (!params.success) {
      res.status(400).json({ error: "invalid_query" });
      return;
    }

    const { branch, from, to, expert, source } = params.data;
    const user = req.user!;

    const conditions: any[] = [];

    // data-scope filter — not authorization. branch_head is forced to their branch.
    if (user.role === "branch_head" && user.branchId) {
      conditions.push(eq(clientsTable.branchId, user.branchId));
    } else if (branch) {
      conditions.push(eq(clientsTable.branchId, branch));
    }

    if (from) conditions.push(gte(clientsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(clientsTable.createdAt, new Date(to)));
    if (expert) conditions.push(eq(clientsTable.assignedToId, expert));
    if (source) conditions.push(eq(clientsTable.leadSource, source));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        status: clientsTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(clientsTable)
      .where(where)
      .groupBy(clientsTable.status);

    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = r.count;

    res.json({ byStatus });
  },
);

export default router;
