import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  clientsTable,
  usersTable,
  branchesTable,
  creditProductsTable,
  articlesTable,
  articleVisibilityTable,
  clientNotesTable,
  clientNextActionsTable,
  questionnaireSessionsTable,
  questionnaireAnswersTable,
  basketsTable,
  basketItemsTable,
  calculationsTable,
} from "@workspace/db";
import { eq, and, desc, sql, count, gte, lte, isNull, or } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.get("/mini-app/dashboard", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const branchId = req.user!.branchId;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [myClients] = await db
    .select({ count: count() })
    .from(clientsTable)
    .where(eq(clientsTable.assignedToId, userId));

  const [myClientsToday] = await db
    .select({ count: count() })
    .from(clientsTable)
    .where(and(eq(clientsTable.assignedToId, userId), gte(clientsTable.createdAt, today)));

  const [myClientsMonth] = await db
    .select({ count: count() })
    .from(clientsTable)
    .where(and(eq(clientsTable.assignedToId, userId), gte(clientsTable.createdAt, monthStart)));

  const [completedMonth] = await db
    .select({ count: count() })
    .from(clientsTable)
    .where(
      and(
        eq(clientsTable.assignedToId, userId),
        eq(clientsTable.status, "completed"),
        gte(clientsTable.updatedAt, monthStart)
      )
    );

  const [basketsToday] = await db
    .select({ count: count() })
    .from(basketsTable)
    .where(and(eq(basketsTable.userId, userId), gte(basketsTable.createdAt, today)));

  const statusCounts = await db
    .select({ status: clientsTable.status, count: count() })
    .from(clientsTable)
    .where(eq(clientsTable.assignedToId, userId))
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

router.get("/mini-app/todo", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const now = new Date();

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
      and(
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
      and(
        eq(clientsTable.assignedToId, userId),
        or(
          eq(clientsTable.status, "draft"),
          eq(clientsTable.status, "questionnaire"),
          eq(clientsTable.status, "recommendation")
        )
      )
    )
    .orderBy(desc(clientsTable.updatedAt))
    .limit(10);

  res.json({ pendingActions, incompleteClients: draftClients });
});

router.get("/mini-app/clients", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const branchId = req.user!.branchId;
  const status = req.query.status as string | undefined;

  let whereClause;
  if (role === "branch_head" && branchId) {
    whereClause = status
      ? and(eq(clientsTable.branchId, branchId), eq(clientsTable.status, status))
      : eq(clientsTable.branchId, branchId);
  } else {
    whereClause = status
      ? and(eq(clientsTable.assignedToId, userId), eq(clientsTable.status, status))
      : eq(clientsTable.assignedToId, userId);
  }

  const clients = await db
    .select({
      id: clientsTable.id,
      sessionId: clientsTable.sessionId,
      fullName: clientsTable.fullName,
      phone: clientsTable.phone,
      status: clientsTable.status,
      branchId: clientsTable.branchId,
      assignedToId: clientsTable.assignedToId,
      createdAt: clientsTable.createdAt,
      updatedAt: clientsTable.updatedAt,
    })
    .from(clientsTable)
    .where(whereClause)
    .orderBy(desc(clientsTable.updatedAt))
    .limit(100);

  res.json(clients);
});

router.post("/mini-app/clients", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const branchId = req.user!.branchId;

  const { fullName, phone } = req.body;
  const sessionId = `S-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  let assignedBranchId = branchId;
  if (!assignedBranchId) {
    const [firstBranch] = await db.select().from(branchesTable).limit(1);
    if (!firstBranch) {
      res.status(400).json({ error: "No branches exist in the system" });
      return;
    }
    assignedBranchId = firstBranch.id;
  }

  const [client] = await db
    .insert(clientsTable)
    .values({
      sessionId,
      fullName: fullName || null,
      phone: phone || null,
      status: "draft",
      branchId: assignedBranchId,
      assignedToId: userId,
    })
    .returning();

  res.json(client);
});

router.get("/mini-app/clients/:id", requireAuth, async (req, res) => {
  const clientId = parseInt(req.params.id);
  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const notes = await db
    .select({
      id: clientNotesTable.id,
      type: clientNotesTable.type,
      content: clientNotesTable.content,
      createdAt: clientNotesTable.createdAt,
      userName: usersTable.name,
    })
    .from(clientNotesTable)
    .leftJoin(usersTable, eq(clientNotesTable.userId, usersTable.id))
    .where(eq(clientNotesTable.clientId, clientId))
    .orderBy(desc(clientNotesTable.createdAt));

  const nextActions = await db
    .select()
    .from(clientNextActionsTable)
    .where(and(eq(clientNextActionsTable.clientId, clientId), eq(clientNextActionsTable.isCompleted, false)))
    .orderBy(clientNextActionsTable.actionDate);

  const basket = await db
    .select()
    .from(basketsTable)
    .where(and(eq(basketsTable.clientId, clientId), eq(basketsTable.status, "active")))
    .limit(1);

  let basketItems: any[] = [];
  if (basket.length) {
    basketItems = await db
      .select()
      .from(basketItemsTable)
      .where(eq(basketItemsTable.basketId, basket[0].id));
  }

  const calculations = await db
    .select()
    .from(calculationsTable)
    .where(eq(calculationsTable.clientId, clientId))
    .orderBy(desc(calculationsTable.createdAt));

  res.json({ client, notes, nextActions, basket: basket[0] || null, basketItems, calculations });
});

router.put("/mini-app/clients/:id", requireAuth, async (req, res) => {
  const clientId = parseInt(req.params.id);
  const { fullName, phone, status } = req.body;

  const updates: any = { updatedAt: new Date() };
  if (fullName !== undefined) updates.fullName = fullName;
  if (phone !== undefined) updates.phone = phone;
  if (status !== undefined) updates.status = status;

  const [updated] = await db
    .update(clientsTable)
    .set(updates)
    .where(eq(clientsTable.id, clientId))
    .returning();

  res.json(updated);
});

router.post("/mini-app/clients/:id/notes", requireAuth, async (req, res) => {
  const clientId = parseInt(req.params.id);
  const { type, content } = req.body;

  const [note] = await db
    .insert(clientNotesTable)
    .values({ clientId, userId: req.user!.id, type: type || "note", content })
    .returning();

  res.json(note);
});

router.post("/mini-app/clients/:id/next-action", requireAuth, async (req, res) => {
  const clientId = parseInt(req.params.id);
  const { actionType, actionDate, priority, description } = req.body;

  const [action] = await db
    .insert(clientNextActionsTable)
    .values({
      clientId,
      userId: req.user!.id,
      actionType,
      actionDate: new Date(actionDate),
      priority: priority || "medium",
      description,
    })
    .returning();

  res.json(action);
});

router.put("/mini-app/next-actions/:id/complete", requireAuth, async (req, res) => {
  const [action] = await db
    .update(clientNextActionsTable)
    .set({ isCompleted: true, updatedAt: new Date() })
    .where(eq(clientNextActionsTable.id, parseInt(req.params.id)))
    .returning();

  res.json(action);
});

router.post("/mini-app/questionnaire", requireAuth, async (req, res) => {
  const { clientId, answers } = req.body;

  const [session] = await db
    .insert(questionnaireSessionsTable)
    .values({ clientId, userId: req.user!.id, status: "completed", completedAt: new Date() })
    .returning();

  if (answers && Array.isArray(answers)) {
    for (const a of answers) {
      await db.insert(questionnaireAnswersTable).values({
        sessionId: session.id,
        questionKey: a.questionKey,
        answer: a.answer,
      });
    }
  }

  await db
    .update(clientsTable)
    .set({ status: "questionnaire", updatedAt: new Date() })
    .where(eq(clientsTable.id, clientId));

  res.json(session);
});

router.post("/mini-app/recommend", requireAuth, async (req, res) => {
  const { clientId, answers } = req.body;

  const allProducts = await db
    .select()
    .from(creditProductsTable)
    .where(eq(creditProductsTable.isActive, true));

  let recommended = allProducts;

  if (answers) {
    const needType = answers.find((a: any) => a.questionKey === "need_type")?.answer;
    const businessSize = answers.find((a: any) => a.questionKey === "business_size")?.answer;
    const loanPurpose = answers.find((a: any) => a.questionKey === "loan_purpose")?.answer;

    if (businessSize) {
      const segmentMap: Record<string, string> = {
        micro: "микро",
        small: "малый",
        medium: "средний",
      };
      const segment = segmentMap[businessSize] || businessSize;
      const filtered = recommended.filter(
        (p) => p.segment?.toLowerCase().includes(segment.toLowerCase())
      );
      if (filtered.length > 0) recommended = filtered;
    }

    if (loanPurpose === "working_capital") {
      recommended = recommended.filter((p) => p.termWorkingCapital);
    } else if (loanPurpose === "fixed_assets") {
      recommended = recommended.filter((p) => p.termFixedAssets);
    }
  }

  if (clientId) {
    await db
      .update(clientsTable)
      .set({ status: "recommendation", updatedAt: new Date() })
      .where(eq(clientsTable.id, clientId));
  }

  res.json({ recommended, total: allProducts.length });
});

router.post("/mini-app/basket", requireAuth, async (req, res) => {
  const { clientId, items } = req.body;

  const existing = await db
    .select()
    .from(basketsTable)
    .where(and(eq(basketsTable.clientId, clientId), eq(basketsTable.status, "active")))
    .limit(1);

  let basketId: number;
  if (existing.length) {
    basketId = existing[0].id;
    await db.delete(basketItemsTable).where(eq(basketItemsTable.basketId, basketId));
    await db
      .update(basketsTable)
      .set({ updatedAt: new Date() })
      .where(eq(basketsTable.id, basketId));
  } else {
    const [basket] = await db
      .insert(basketsTable)
      .values({ clientId, userId: req.user!.id })
      .returning();
    basketId = basket.id;
  }

  if (items && Array.isArray(items)) {
    for (const item of items) {
      await db.insert(basketItemsTable).values({
        basketId,
        productId: item.productId || null,
        productType: item.productType || "credit",
        productName: item.productName,
        notes: item.notes || null,
      });
    }
  }

  await db
    .update(clientsTable)
    .set({ status: "basket", updatedAt: new Date() })
    .where(eq(clientsTable.id, clientId));

  res.json({ basketId });
});

router.post("/mini-app/calculate", requireAuth, async (req, res) => {
  const {
    clientId,
    productName,
    loanAmount,
    interestRate,
    termMonths,
    repaymentType,
    initialPayment,
    gracePeriodMonths,
    currency,
  } = req.body;

  const principal = parseFloat(loanAmount) - (parseFloat(initialPayment) || 0);
  const monthlyRate = parseFloat(interestRate) / 100 / 12;
  const grace = parseInt(gracePeriodMonths) || 0;
  const term = parseInt(termMonths);
  const paymentTerm = term - grace;

  let monthlyPayment: number;
  let totalPayment: number;
  let totalInterest: number;
  const schedule: any[] = [];

  if (repaymentType === "differentiated") {
    const principalPayment = principal / paymentTerm;
    let remaining = principal;
    totalPayment = 0;
    totalInterest = 0;

    for (let i = 1; i <= term; i++) {
      if (i <= grace) {
        const interest = remaining * monthlyRate;
        totalPayment += interest;
        totalInterest += interest;
        schedule.push({ month: i, principal: 0, interest: +interest.toFixed(2), payment: +interest.toFixed(2), remaining: +remaining.toFixed(2) });
      } else {
        const interest = remaining * monthlyRate;
        const payment = principalPayment + interest;
        remaining -= principalPayment;
        totalPayment += payment;
        totalInterest += interest;
        schedule.push({ month: i, principal: +principalPayment.toFixed(2), interest: +interest.toFixed(2), payment: +payment.toFixed(2), remaining: +Math.max(0, remaining).toFixed(2) });
      }
    }
    monthlyPayment = principalPayment + principal * monthlyRate;
  } else {
    let remaining = principal;
    totalPayment = 0;
    totalInterest = 0;

    if (grace > 0) {
      for (let i = 1; i <= grace; i++) {
        const interest = remaining * monthlyRate;
        totalPayment += interest;
        totalInterest += interest;
        schedule.push({ month: i, principal: 0, interest: +interest.toFixed(2), payment: +interest.toFixed(2), remaining: +remaining.toFixed(2) });
      }
    }

    const annuityCoeff = (monthlyRate * Math.pow(1 + monthlyRate, paymentTerm)) / (Math.pow(1 + monthlyRate, paymentTerm) - 1);
    monthlyPayment = principal * annuityCoeff;

    for (let i = grace + 1; i <= term; i++) {
      const interest = remaining * monthlyRate;
      const principalPart = monthlyPayment - interest;
      remaining -= principalPart;
      totalPayment += monthlyPayment;
      totalInterest += interest;
      schedule.push({ month: i, principal: +principalPart.toFixed(2), interest: +interest.toFixed(2), payment: +monthlyPayment.toFixed(2), remaining: +Math.max(0, remaining).toFixed(2) });
    }
  }

  const [calc] = await db
    .insert(calculationsTable)
    .values({
      clientId: clientId || null,
      userId: req.user!.id,
      productName,
      loanAmount: principal.toString(),
      interestRate: interestRate.toString(),
      termMonths: term,
      repaymentType: repaymentType || "annuity",
      initialPayment: (parseFloat(initialPayment) || 0).toString(),
      gracePeriodMonths: grace,
      monthlyPayment: monthlyPayment.toFixed(2),
      totalPayment: totalPayment.toFixed(2),
      totalInterest: totalInterest.toFixed(2),
      currency: currency || "UZS",
    })
    .returning();

  res.json({
    calculation: calc,
    schedule,
    summary: {
      monthlyPayment: +monthlyPayment.toFixed(2),
      totalPayment: +totalPayment.toFixed(2),
      totalInterest: +totalInterest.toFixed(2),
      principal: +principal.toFixed(2),
    },
  });
});

router.get("/mini-app/products", requireAuth, async (req, res) => {
  const products = await db
    .select()
    .from(creditProductsTable)
    .where(eq(creditProductsTable.isActive, true))
    .orderBy(creditProductsTable.number);

  res.json(products);
});

router.get("/mini-app/articles", requireAuth, async (req, res) => {
  const branchId = req.user!.branchId;

  const articles = await db
    .select({
      id: articlesTable.id,
      title: articlesTable.title,
      content: articlesTable.content,
      category: articlesTable.category,
      isPublished: articlesTable.isPublished,
      targetAllBranches: articlesTable.targetAllBranches,
      createdAt: articlesTable.createdAt,
      authorName: usersTable.name,
    })
    .from(articlesTable)
    .leftJoin(usersTable, eq(articlesTable.authorId, usersTable.id))
    .where(eq(articlesTable.isPublished, true))
    .orderBy(desc(articlesTable.createdAt));

  let filtered = articles;
  if (branchId) {
    const visibilities = await db
      .select()
      .from(articleVisibilityTable)
      .where(eq(articleVisibilityTable.branchId, branchId));
    const visibleIds = new Set(visibilities.map((v) => v.articleId));

    filtered = articles.filter((a) => a.targetAllBranches || visibleIds.has(a.id));
  }

  res.json(filtered);
});

router.get("/mini-app/branch-summary", requireAuth, async (req, res) => {
  const branchId = req.user!.branchId;
  if (!branchId || req.user!.role !== "branch_head") {
    res.status(403).json({ error: "Branch head only" });
    return;
  }

  const workers = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, isActive: usersTable.isActive })
    .from(usersTable)
    .where(and(eq(usersTable.branchId, branchId), eq(usersTable.isActive, true)));

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

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

export default router;
