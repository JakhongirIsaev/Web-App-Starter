import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import XLSX from "xlsx";
import {
  clientsTable,
  type ClientStatus,
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
  clientDocumentsTable,
} from "@workspace/db";
import { eq, and, desc, sql, count, gte, lte, isNull, or, inArray } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { generateClientPdf } from "../pdf/generate";
import { sendDocument } from "../bot";
import { validateTelegramInitData } from "../lib/telegram";
import { generateOfferSummary } from "../ai/service";
import {
  formatDateTimeInAppTimeZone,
  formatFileDate,
  startOfAppDay,
  startOfAppMonth,
} from "../lib/timezone";
import {
  buildClientPreferenceProfile,
  buildRecommendationNote,
  getRateSummary,
  getRelevantTerm,
  summarizeClientPreferences,
  type ProductLike,
  type QuestionnaireAnswer,
} from "../lib/recommendation";

const router: IRouter = Router();
const adminRoles = ["superadmin", "head_office_admin"];

async function verifyClientAccess(clientId: number, user: { id: number; role: string; branchId: number | null }): Promise<boolean> {
  const [client] = await db
    .select({ assignedToId: clientsTable.assignedToId, branchId: clientsTable.branchId })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);
  if (!client) return false;
  if (user.role === "superadmin" || user.role === "head_office_admin") return true;
  if (user.role === "branch_head" && user.branchId && client.branchId === user.branchId) return true;
  return client.assignedToId === user.id;
}

function getSegmentAliases(value?: string | null) {
  if (!value) return [];

  const normalized = value.toLowerCase();
  const aliasMap: Record<string, string[]> = {
    micro: ["micro", "mikro", "микро"],
    small: ["small", "kichik", "малый", "малый бизнес", "small business"],
    medium: ["medium", "o'rta", "средний", "middle"],
  };

  return aliasMap[normalized] || [normalized];
}

async function getLatestQuestionnaireAnswers(clientId: number): Promise<QuestionnaireAnswer[]> {
  const [session] = await db
    .select({ id: questionnaireSessionsTable.id })
    .from(questionnaireSessionsTable)
    .where(eq(questionnaireSessionsTable.clientId, clientId))
    .orderBy(desc(questionnaireSessionsTable.createdAt))
    .limit(1);

  if (!session) return [];

  return db
    .select({
      questionKey: questionnaireAnswersTable.questionKey,
      answer: questionnaireAnswersTable.answer,
    })
    .from(questionnaireAnswersTable)
    .where(eq(questionnaireAnswersTable.sessionId, session.id))
    .orderBy(questionnaireAnswersTable.id);
}

async function getDetailedBasketItems(clientId: number) {
  const [basket] = await db
    .select()
    .from(basketsTable)
    .where(and(eq(basketsTable.clientId, clientId), eq(basketsTable.status, "active")))
    .limit(1);

  if (!basket) return [];

  const basketItems = await db
    .select()
    .from(basketItemsTable)
    .where(eq(basketItemsTable.basketId, basket.id));

  const productIds = basketItems
    .map((item) => item.productId)
    .filter((value): value is number => typeof value === "number");

  const products = productIds.length > 0
    ? await db
        .select()
        .from(creditProductsTable)
        .where(inArray(creditProductsTable.id, productIds))
    : [];

  const productMap = new Map(products.map((product) => [product.id, product]));

  return basketItems.map((item) => {
    const product = item.productId ? productMap.get(item.productId) : undefined;
    return {
      ...item,
      ...product,
      whySuitable: item.notes || null,
    };
  });
}

async function buildPdfPayload(clientId: number, user: { id: number }) {
  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (!client) return null;

  const basketItems = await getDetailedBasketItems(clientId);
  const calculations = await db
    .select()
    .from(calculationsTable)
    .where(eq(calculationsTable.clientId, clientId))
    .orderBy(desc(calculationsTable.createdAt));

  const answers = await getLatestQuestionnaireAnswers(clientId);
  const profile = buildClientPreferenceProfile(answers);
  const preferenceSummary = summarizeClientPreferences(profile);

  const [expert] = await db
    .select({ name: usersTable.name, telegramId: usersTable.telegramId })
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1);

  const [branch] = client.branchId
    ? await db.select().from(branchesTable).where(eq(branchesTable.id, client.branchId)).limit(1)
    : [null];

  return {
    client,
    basketItems,
    calculations,
    preferenceSummary,
    expertName: expert?.name || "-",
    expertTelegramId: expert?.telegramId || null,
    branchName: branch?.name || "-",
  };
}

function calculationsToSummaryInput(calculation: {
  loanAmount: string;
  monthlyPayment: string | null;
  totalPayment: string | null;
  totalInterest: string | null;
  termMonths: number;
  interestRate: string;
  currency: string;
} | undefined) {
  if (!calculation) return null;

  return {
    loanAmount: calculation.loanAmount,
    monthlyPayment: calculation.monthlyPayment || undefined,
    totalPayment: calculation.totalPayment || undefined,
    totalInterest: calculation.totalInterest || undefined,
    termMonths: calculation.termMonths,
    interestRate: calculation.interestRate,
    currency: calculation.currency,
  };
}

async function buildOfferSummaryForPdf(
  payload: NonNullable<Awaited<ReturnType<typeof buildPdfPayload>>>,
  language: "ru" | "uz" | "en",
) {
  const selectedProducts = payload.basketItems.map((item) => ({
    productId: typeof item.productId === "number" ? item.productId : null,
    productName: item.productName || item.name || "Mahsulot",
    amount: item.loanAmount || undefined,
    rate: [item.rateUZS, item.rateUSD, item.rateEUR].filter(Boolean).join(" | ") || undefined,
    termMonths: undefined,
  }));

  if (selectedProducts.length === 0) {
    return null;
  }

  const latestCalculation = calculationsToSummaryInput(payload.calculations[0]);
  const offerSummaryResult = await generateOfferSummary({
    selectedProducts,
    calculatorResult: latestCalculation ?? undefined,
    clientName: payload.client.fullName || "Mijoz",
    language,
  });

  return offerSummaryResult.summary;
}

router.get("/mini-app/dashboard", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const branchId = req.user!.branchId;
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

router.get("/mini-app/todo", requireAuth, async (req, res) => {
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
            eq(clientsTable.status, "questionnaire"),
            eq(clientsTable.status, "recommendation")
          )
        : and(
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
  const status = typeof req.query.status === "string" ? req.query.status as ClientStatus : undefined;
  const isAdmin = adminRoles.includes(role);

  let whereClause;
  if (isAdmin) {
    whereClause = status ? eq(clientsTable.status, status) : undefined;
  } else if (role === "branch_head" && branchId) {
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

router.get("/mini-app/clients/export-all", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const branchId = req.user!.branchId;

  let whereClause;
  if (role === "superadmin" || role === "head_office_admin") {
    whereClause = undefined;
  } else if (role === "branch_head" && branchId) {
    whereClause = eq(clientsTable.branchId, branchId);
  } else {
    whereClause = eq(clientsTable.assignedToId, userId);
  }

  const clients = await db
    .select()
    .from(clientsTable)
    .where(whereClause)
    .orderBy(desc(clientsTable.updatedAt));

  let text = `=== BARCHA MIJOZLAR EKSPORTI ===\n`;
  text += `Sana: ${formatFileDate()}\n`;
  text += `Jami: ${clients.length}\n\n`;

  for (const client of clients) {
    text += `${"=".repeat(50)}\n`;
    text += `F.I.Sh.: ${client.fullName || "-"}\n`;
    text += `Telefon: ${client.phone || "-"}\n`;
    text += `Holat: ${client.status}\n`;
    text += `Yaratilgan sana: ${formatDateTimeInAppTimeZone(client.createdAt)}\n`;

    const docs = await db
      .select()
      .from(clientDocumentsTable)
      .where(eq(clientDocumentsTable.clientId, client.id));

    if (docs.length > 0) {
      text += `Hujjatlar: ${docs.length}\n`;
      for (const doc of docs) {
        text += `  - ${doc.docType} (${doc.fileName})`;
        if (doc.extractedData && typeof doc.extractedData === "object") {
          const entries = Object.entries(doc.extractedData as Record<string, string>);
          if (entries.length > 0) {
            text += `: ${entries.map(([k, v]) => `${k}=${v}`).join(", ")}`;
          }
        }
        text += `\n`;
      }
    }

    const clientNotes = await db
      .select()
      .from(clientNotesTable)
      .where(eq(clientNotesTable.clientId, client.id));

    if (clientNotes.length > 0) {
      text += `Izohlar: ${clientNotes.length}\n`;
      for (const n of clientNotes) {
        text += `  - [${formatDateTimeInAppTimeZone(n.createdAt)}] ${n.content}\n`;
      }
    }

    const calcs = await db
      .select()
      .from(calculationsTable)
      .where(eq(calculationsTable.clientId, client.id));

    if (calcs.length > 0) {
      text += `Hisob-kitoblar: ${calcs.length}\n`;
      for (const c of calcs) {
        text += `  - ${c.productName}: ${c.loanAmount} ${c.currency}, ${c.termMonths} oy, ${c.interestRate}%\n`;
      }
    }

    text += `\n`;
  }

  const dateStr = formatFileDate();
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="all_clients_${dateStr}.txt"; filename*=UTF-8''${encodeURIComponent(`all_clients_export_${dateStr}.txt`)}`);
  res.send(text);
});

router.get("/mini-app/clients/:id", requireAuth, async (req, res) => {
  const clientId = Number(req.params.id);
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

  const basketItems = await getDetailedBasketItems(clientId);

  const calculations = await db
    .select()
    .from(calculationsTable)
    .where(eq(calculationsTable.clientId, clientId))
    .orderBy(desc(calculationsTable.createdAt));

  res.json({ client, notes, nextActions, basket: basket[0] || null, basketItems, calculations });
});

router.put("/mini-app/clients/:id", requireAuth, async (req, res) => {
  const clientId = Number(req.params.id);
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
  const clientId = Number(req.params.id);
  const { type, content } = req.body;

  const [note] = await db
    .insert(clientNotesTable)
    .values({ clientId, userId: req.user!.id, type: type || "note", content })
    .returning();

  res.json(note);
});

router.post("/mini-app/clients/:id/next-action", requireAuth, async (req, res) => {
  const clientId = Number(req.params.id);
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
    .where(eq(clientNextActionsTable.id, Number(req.params.id)))
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
  const { clientId, answers = [] } = req.body;

  const allProducts = await db
    .select()
    .from(creditProductsTable)
    .where(eq(creditProductsTable.isActive, true));

  let recommended = allProducts;
  const answerList = Array.isArray(answers) ? answers : [];
  const profile = buildClientPreferenceProfile(answerList);

  if (profile.businessSize) {
    const aliases = getSegmentAliases(profile.businessSize);
    const filtered = recommended.filter((product) => {
      const segment = product.segment?.toLowerCase() || "";
      return aliases.some((alias) => segment.includes(alias));
    });
    if (filtered.length > 0) recommended = filtered;
  }

  if (profile.loanPurpose === "working_capital") {
    recommended = recommended.filter((product) => product.termWorkingCapital);
  } else if (profile.loanPurpose === "fixed_assets") {
    recommended = recommended.filter((product) => product.termFixedAssets);
  } else if (profile.loanPurpose === "untargeted") {
    recommended = recommended.filter((product) => product.termUntargeted);
  }

  const enrichedRecommended = recommended.map((product) => ({
    ...product,
    whySuitable: buildRecommendationNote(product as ProductLike, profile),
    relevantTerm: getRelevantTerm(product as ProductLike, profile.loanPurpose),
    rateSummary: getRateSummary(product as ProductLike),
  }));

  if (clientId) {
    await db
      .update(clientsTable)
      .set({ status: "recommendation", updatedAt: new Date() })
      .where(eq(clientsTable.id, clientId));
  }

  res.json({
    recommended: enrichedRecommended,
    preferenceProfile: profile,
    total: allProducts.length,
    recommendedCount: enrichedRecommended.length,
  });
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

router.post("/mini-app/clients/:id/documents", requireAuth, async (req, res) => {
  const clientId = Number(req.params.id);
  if (!(await verifyClientAccess(clientId, req.user!))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const { docType, fileName, storagePath, ocrText, extractedData } = req.body;
  if (!fileName || !storagePath) {
    res.status(400).json({ error: "fileName and storagePath are required" });
    return;
  }
  const [doc] = await db.insert(clientDocumentsTable).values({
    clientId,
    userId: req.user!.id,
    docType: docType || "other",
    fileName,
    storagePath,
    ocrText: ocrText || null,
    extractedData: extractedData || null,
  }).returning();
  res.status(201).json(doc);
});

router.get("/mini-app/clients/:id/documents", requireAuth, async (req, res) => {
  const clientId = Number(req.params.id);
  if (!(await verifyClientAccess(clientId, req.user!))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const docs = await db
    .select()
    .from(clientDocumentsTable)
    .where(eq(clientDocumentsTable.clientId, clientId))
    .orderBy(desc(clientDocumentsTable.createdAt));
  res.json(docs);
});

router.put("/mini-app/documents/:id/ocr", requireAuth, async (req, res) => {
  const docId = Number(req.params.id);
  const { ocrText, extractedData } = req.body;
  const [updated] = await db
    .update(clientDocumentsTable)
    .set({ ocrText, extractedData })
    .where(eq(clientDocumentsTable.id, docId))
    .returning();
  if (!updated) { res.status(404).json({ error: "Document not found" }); return; }
  res.json(updated);
});

router.delete("/mini-app/documents/:id", requireAuth, async (req, res) => {
  const docId = Number(req.params.id);
  const [deleted] = await db
    .delete(clientDocumentsTable)
    .where(eq(clientDocumentsTable.id, docId))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Document not found" }); return; }
  res.json({ success: true });
});

router.post("/mini-app/clients/:id/generate-pdf", requireAuth, async (req, res) => {
  const clientId = Number(req.params.id);
  const user = req.user!;
  const sendViaTelegram = req.body.sendViaTelegram !== false;
  const telegramInitData =
    typeof req.body.telegramInitData === "string"
      ? req.body.telegramInitData.trim()
      : "";

  if (!(await verifyClientAccess(clientId, user))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const payload = await buildPdfPayload(clientId, user);
  if (!payload) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  try {
    const language =
      req.body.language === "ru" || req.body.language === "en"
        ? req.body.language
        : "uz";
    const offerSummary = await buildOfferSummaryForPdf(payload, language);

    const pdfBuffer = await generateClientPdf({
      ...payload,
      offerSummary,
    });

    let telegramSent = false;
    let targetTelegramId = payload.expertTelegramId;

    if (sendViaTelegram && telegramInitData && process.env.TELEGRAM_BOT_TOKEN) {
      const validatedTelegram = validateTelegramInitData(
        telegramInitData,
        process.env.TELEGRAM_BOT_TOKEN,
      );

      if (validatedTelegram.valid && validatedTelegram.user?.id) {
        targetTelegramId = String(validatedTelegram.user.id);
      }
    }

    if (sendViaTelegram && targetTelegramId) {
      const filename = `KP_${(payload.client.fullName || "client").replace(/\s+/g, "_")}_${formatFileDate()}.pdf`;
      const caption = `📋 Tijorat taklifi: ${payload.client.fullName || "Mijoz"}\n👤 Ekspert: ${payload.expertName}`;
      telegramSent = await sendDocument(targetTelegramId, pdfBuffer, filename, caption);
    }

    await db
      .update(clientsTable)
      .set({ status: "pdf_generated", updatedAt: new Date() })
      .where(eq(clientsTable.id, clientId));

    res.json({
      success: true,
      telegramSent,
      sentToTelegramId: telegramSent ? targetTelegramId : null,
      pdfSize: pdfBuffer.length,
    });
  } catch (err: any) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

router.post("/mini-app/exports/auto-excel", requireAuth, async (req, res) => {
  const extractedData =
    req.body?.extractedData && typeof req.body.extractedData === "object"
      ? (req.body.extractedData as Record<string, unknown>)
      : {};
  const ocrText = typeof req.body?.ocrText === "string" ? req.body.ocrText : "";
  const imageCount =
    typeof req.body?.imageCount === "number" && Number.isFinite(req.body.imageCount)
      ? req.body.imageCount
      : 0;
  const clientId =
    typeof req.body?.clientId === "number" && Number.isFinite(req.body.clientId)
      ? req.body.clientId
      : null;

  const workbook = XLSX.utils.book_new();
  const vehicleSheet = XLSX.utils.json_to_sheet([
    {
      clientId: clientId ?? "",
      exportedAt: formatDateTimeInAppTimeZone(new Date()),
      imageCount,
      make: String(extractedData.make ?? ""),
      model: String(extractedData.model ?? ""),
      vehicleType: String(extractedData.vehicleType ?? ""),
      color: String(extractedData.color ?? ""),
      plateText: String(extractedData.plateText ?? extractedData.plateNumber ?? ""),
      approximateYear: String(extractedData.approximateYear ?? ""),
      vin: String(extractedData.vin ?? ""),
      visibleConditionNotes: String(extractedData.visibleConditionNotes ?? ""),
      confidence: String(extractedData.confidence ?? ""),
      rawNotes: String(extractedData.rawNotes ?? ""),
    },
  ]);
  XLSX.utils.book_append_sheet(workbook, vehicleSheet, "Vehicle");

  const rawTextSheet = XLSX.utils.aoa_to_sheet([
    ["OCR Text"],
    [ocrText || ""],
  ]);
  XLSX.utils.book_append_sheet(workbook, rawTextSheet, "OCR");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const fileName = `auto_extract_${clientId ?? "preview"}_${formatFileDate()}.xlsx`;

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );
  res.send(buffer);
});

router.get("/mini-app/clients/:id/download-pdf", requireAuth, async (req, res) => {
  const clientId = Number(req.params.id);

  if (!(await verifyClientAccess(clientId, req.user!))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const payload = await buildPdfPayload(clientId, req.user!);
  if (!payload) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  try {
    const language =
      req.query.language === "ru" || req.query.language === "en"
        ? req.query.language
        : "uz";
    const offerSummary = await buildOfferSummaryForPdf(payload, language);
    const pdfBuffer = await generateClientPdf({
      ...payload,
      offerSummary,
    });

    const fileDate = formatFileDate();
    const safeName = `KP_${payload.client.id}_${fileDate}.pdf`;
    const displayName = `KP_${(payload.client.fullName || "client").replace(/\s+/g, "_")}_${fileDate}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(displayName)}`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error("PDF download error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

router.get("/mini-app/clients/:id/export", requireAuth, async (req, res) => {
  const clientId = Number(req.params.id);

  if (!(await verifyClientAccess(clientId, req.user!))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const docs = await db
    .select()
    .from(clientDocumentsTable)
    .where(eq(clientDocumentsTable.clientId, clientId))
    .orderBy(desc(clientDocumentsTable.createdAt));

  const clientNotes = await db
    .select()
    .from(clientNotesTable)
    .where(eq(clientNotesTable.clientId, clientId));

  const calcs = await db
    .select()
    .from(calculationsTable)
    .where(eq(calculationsTable.clientId, clientId));

  let text = `=== MIJOZ MA'LUMOTLARI ===\n`;
  text += `F.I.Sh.: ${client.fullName || "-"}\n`;
  text += `Telefon: ${client.phone || "-"}\n`;
  text += `Holat: ${client.status}\n`;
  text += `Yaratilgan sana: ${formatDateTimeInAppTimeZone(client.createdAt)}\n\n`;

  if (docs.length > 0) {
    text += `=== HUJJATLAR (${docs.length}) ===\n`;
    for (const doc of docs) {
      text += `\n--- ${doc.docType} (${doc.fileName}) ---\n`;
      if (doc.extractedData && typeof doc.extractedData === "object") {
        for (const [k, v] of Object.entries(doc.extractedData as Record<string, string>)) {
          text += `  ${k}: ${v}\n`;
        }
      }
      if (doc.ocrText) {
        text += `  OCR matn: ${doc.ocrText}\n`;
      }
    }
    text += `\n`;
  }

  if (clientNotes.length > 0) {
    text += `=== IZOH VA ESLATMALAR (${clientNotes.length}) ===\n`;
    for (const n of clientNotes) {
      text += `[${formatDateTimeInAppTimeZone(n.createdAt)}] ${n.content}\n`;
    }
    text += `\n`;
  }

  if (calcs.length > 0) {
    text += `=== HISOB-KITOBLAR (${calcs.length}) ===\n`;
    for (const c of calcs) {
      text += `${c.productName}: ${c.loanAmount} ${c.currency}, ${c.termMonths} oy, ${c.interestRate}%, oylik to'lov: ${c.monthlyPayment}\n`;
    }
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="client_${clientId}.txt"; filename*=UTF-8''${encodeURIComponent(`client_${clientId}_export.txt`)}`);
  res.send(text);
});

export default router;



