import { Router, type IRouter } from "express";
import {
  db,
  clientsTable,
  usersTable,
  clientNextActionsTable,
  basketsTable,
  eq,
  and,
  desc,
  count,
  gte,
  lte,
  or,
  guestAuth,
  startOfAppDay,
  startOfAppMonth,
  requireNextActionAccess,
  forbidden,
  adminRoles,
  getClientPreferenceAnswers,
} from "./_shared";

const router: IRouter = Router();
router.get("/mini-app/dashboard", guestAuth, async (req, res) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const today = startOfAppDay();
  const monthStart = startOfAppMonth();
  const isAdmin = adminRoles.includes(role);

  const [myClients] = await db
    .select({ count: count() })
    .from(clientsTable)
    .where(
      isAdmin
        ? undefined
        : eq(clientsTable.assignedToId, userId)
    );

  const [myClientsToday] = await db
    .select({ count: count() })
    .from(clientsTable)
    .where(
      isAdmin
        ? gte(clientsTable.createdAt, today)
        : and(eq(clientsTable.assignedToId, userId), gte(clientsTable.createdAt, today))
    );

  const [myClientsMonth] = await db
    .select({ count: count() })
    .from(clientsTable)
    .where(
      isAdmin
        ? gte(clientsTable.createdAt, monthStart)
        : and(eq(clientsTable.assignedToId, userId), gte(clientsTable.createdAt, monthStart))
    );

  const [completedMonth] = await db
    .select({ count: count() })
    .from(clientsTable)
    .where(
      isAdmin
        ? and(
            eq(clientsTable.status, "completed"),
            gte(clientsTable.updatedAt, monthStart)
          )
        : and(
            eq(clientsTable.assignedToId, userId),
            eq(clientsTable.status, "completed"),
            gte(clientsTable.updatedAt, monthStart)
          )
    );

  const [basketsToday] = await db
    .select({ count: count() })
    .from(basketsTable)
    .where(
      isAdmin
        ? gte(basketsTable.createdAt, today)
        : and(eq(basketsTable.userId, userId), gte(basketsTable.createdAt, today))
    );

  const statusCounts = await db
    .select({ status: clientsTable.status, count: count() })
    .from(clientsTable)
    .where(
      isAdmin
        ? undefined
        : eq(clientsTable.assignedToId, userId)
    )
    .groupBy(clientsTable.status);

  res.json({
    totalClients: myClients.count,
    clientsToday: myClientsToday.count,
    clientsThisMonth: myClientsMonth.count,
    completedThisMonth: completedMonth.count,
    proposalsToday: basketsToday.count,
    statusBreakdown: statusCounts,
  });
});

// "My Day" widget — today/week counts and 7-day funnel breakdown for the
// current credit expert. Always scoped to assignedToId === user.id (admins
// see only their own assigned clients here; the global view lives on
// /mini-app/dashboard).


router.get("/mini-app/dashboard/me", guestAuth, async (req, res) => {
  const userId = req.user!.id;
  const todayStart = startOfAppDay();
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const [todayCount] = await db
    .select({ count: count() })
    .from(clientsTable)
    .where(
      and(
        eq(clientsTable.assignedToId, userId),
        gte(clientsTable.createdAt, todayStart),
      ),
    );

  const [weekCount] = await db
    .select({ count: count() })
    .from(clientsTable)
    .where(
      and(
        eq(clientsTable.assignedToId, userId),
        gte(clientsTable.createdAt, weekStart),
      ),
    );

  const breakdown = await db
    .select({
      status: clientsTable.status,
      count: count(),
    })
    .from(clientsTable)
    .where(
      and(
        eq(clientsTable.assignedToId, userId),
        gte(clientsTable.createdAt, weekStart),
      ),
    )
    .groupBy(clientsTable.status);

  const byStatus: Record<string, number> = {};
  for (const row of breakdown) byStatus[row.status] = row.count;

  res.json({
    today: todayCount?.count ?? 0,
    week: weekCount?.count ?? 0,
    byStatus,
  });
});


router.get("/mini-app/todo", guestAuth, async (req, res) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const now = new Date();
  const isAdmin = adminRoles.includes(role);

  const pendingActions = await db
    .select({
      id: clientNextActionsTable.id,
      clientId: clientNextActionsTable.clientId,
      actionType: clientNextActionsTable.actionType,
      actionDate: clientNextActionsTable.actionDate,
      priority: clientNextActionsTable.priority,
      description: clientNextActionsTable.description,
      clientName: clientsTable.fullName,
    })
    .from(clientNextActionsTable)
    .leftJoin(clientsTable, eq(clientNextActionsTable.clientId, clientsTable.id))
    .where(
      isAdmin
        ? and(
            eq(clientNextActionsTable.isCompleted, false),
            lte(clientNextActionsTable.actionDate, new Date(now.getTime() + 24 * 60 * 60 * 1000))
          )
        : and(
            eq(clientNextActionsTable.userId, userId),
            eq(clientNextActionsTable.isCompleted, false),
            lte(clientNextActionsTable.actionDate, new Date(now.getTime() + 24 * 60 * 60 * 1000))
          )
    )
    .orderBy(clientNextActionsTable.actionDate)
    .limit(20);

  const draftClients = await db
    .select({ id: clientsTable.id, fullName: clientsTable.fullName, status: clientsTable.status })
    .from(clientsTable)
    .where(
      isAdmin
        ? or(
            eq(clientsTable.status, "draft"),
            // Phase B3a: "lead" is the sole mid-funnel marker; the legacy
            // "questionnaire" status was backfilled to "lead" by migration
            // 0008 and dropped from clientStatusEnum in 0012.
            eq(clientsTable.status, "lead"),
            eq(clientsTable.status, "recommendation")
          )
        : and(
            eq(clientsTable.assignedToId, userId),
            or(
              eq(clientsTable.status, "draft"),
              eq(clientsTable.status, "lead"),
              eq(clientsTable.status, "recommendation")
            )
          )
    )
    .orderBy(desc(clientsTable.updatedAt))
    .limit(10);

  res.json({ pendingActions, incompleteClients: draftClients });
});


router.get("/mini-app/branch-summary", guestAuth, async (req, res) => {
  const branchId = req.user!.branchId;
  if (!branchId || req.user!.role !== "branch_head") {
    forbidden(res, "Faqat filial rahbari uchun");
    return;
  }

  const workers = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, isActive: usersTable.isActive })
    .from(usersTable)
    .where(and(eq(usersTable.branchId, branchId), eq(usersTable.isActive, true)));

  const monthStart = startOfAppMonth();

  const workerStats = [];
  for (const w of workers) {
    const [clientCount] = await db
      .select({ count: count() })
      .from(clientsTable)
      .where(eq(clientsTable.assignedToId, w.id));

    const [monthCount] = await db
      .select({ count: count() })
      .from(clientsTable)
      .where(and(eq(clientsTable.assignedToId, w.id), gte(clientsTable.createdAt, monthStart)));

    const [completedCount] = await db
      .select({ count: count() })
      .from(clientsTable)
      .where(and(eq(clientsTable.assignedToId, w.id), eq(clientsTable.status, "completed")));

    workerStats.push({
      ...w,
      totalClients: clientCount.count,
      monthClients: monthCount.count,
      completedClients: completedCount.count,
    });
  }

  const [branchTotal] = await db
    .select({ count: count() })
    .from(clientsTable)
    .where(eq(clientsTable.branchId, branchId));

  res.json({ workers: workerStats, totalBranchClients: branchTotal.count });
});


router.put("/mini-app/next-actions/:id/complete", guestAuth, requireNextActionAccess, async (req, res) => {
  const [action] = await db
    .update(clientNextActionsTable)
    .set({ isCompleted: true, updatedAt: new Date() })
    .where(eq(clientNextActionsTable.id, Number(req.params.id)))
    .returning();

  res.json(action);
});

// Phase B3a: POST /mini-app/questionnaire was removed alongside the legacy
// questionnaire UI. The fixed lead-form on /new-client persists answers
// directly via POST /mini-app/clients (and PUT /mini-app/clients/:id), and
// the recommendation flow reads them from clientsTable through
// getClientPreferenceAnswers().


export default router;
