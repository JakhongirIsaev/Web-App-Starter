import { Router, type IRouter } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import XLSX from "xlsx";
import {
  clientsTable,
  type ClientStatus,
  usersTable,
  branchesTable,
  creditProductsTable,
  creditLinesTable,
  productsTable,
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
import {
  requireClientAccess,
  requireDocumentAccess,
  requireNextActionAccess,
  requireClientAccessFromBody,
} from "../lib/client-access";
import { generateClientPdf } from "../pdf/generate";
import { sendDocument } from "../bot";
import { validateTelegramInitData } from "../lib/telegram";
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
  isCreditNeedType,
  isNonCreditNeedType,
  summarizeClientPreferences,
  type ProductLike,
  type QuestionnaireAnswer,
} from "../lib/recommendation";
import { buildCalculationSummary } from "../lib/calculations";
import {
  MiniAppCalculateBody as CalculateBody,
  MiniAppQuestionnaireBody as QuestionnaireBody,
  MiniAppRecommendBody as RecommendBody,
  MiniAppBasketBody as BasketBody,
  MiniAppCreateClientBody as CreateClientBody,
  MiniAppUpdateClientBody as UpdateClientBody,
  MiniAppNoteBody as NoteBody,
  MiniAppNextActionBody as NextActionBody,
  MiniAppDocumentBody as DocumentBody,
  MiniAppOcrUpdateBody as OcrUpdateBody,
  MiniAppGeneratePdfBody as GeneratePdfBody,
  MiniAppAutoExcelBody as AutoExcelBody,
} from "@workspace/api-zod";

const router: IRouter = Router();
const adminRoles = ["superadmin", "head_office_admin"];
type PdfLanguage = "ru" | "uz" | "en";

interface DetailedBasketItem extends ProductLike {
  id: number;
  basketId: number;
  productId: number | null;
  productType: "credit" | "non_credit";
  productName: string;
  name: string;
  calculationId?: number | null;
  notes?: string | null;
  whySuitable?: string | null;
  sapCode?: string | null;
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

function getNonCreditSegmentLabel(language: PdfLanguage) {
  if (language === "ru") return "Некредитный продукт";
  if (language === "en") return "Non-credit product";
  return "Nokredit mahsulot";
}

function extractScaledNumbers(value?: string | number | null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return [value];
  }

  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }

  const normalized = value.toLowerCase();
  const matches = Array.from(normalized.matchAll(/(\d+(?:[.,]\d+)?)/g));

  return matches
    .map((match) => {
      const raw = match[1].replace(",", ".");
      const parsed = Number.parseFloat(raw);
      if (!Number.isFinite(parsed)) return null;

      const suffix = normalized.slice(match.index ?? 0, (match.index ?? 0) + 12);
      const multiplier =
        /\b(млн|million|mln)\b/.test(suffix)
          ? 1_000_000
          : /\b(тыс|thousand|ming)\b/.test(suffix)
            ? 1_000
            : 1;

      return parsed * multiplier;
    })
    .filter((item): item is number => item !== null);
}

function parseAmountValue(value?: string | number | null) {
  const [first] = extractScaledNumbers(value);
  return typeof first === "number" && Number.isFinite(first) ? first : null;
}

function parsePercentValue(value?: string | null) {
  if (!value) return null;
  const percentMatch = value.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (percentMatch) {
    return Number.parseFloat(percentMatch[1].replace(",", "."));
  }

  const [first] = extractScaledNumbers(value);
  return typeof first === "number" && Number.isFinite(first) ? first : null;
}

function parseIntegerValue(value?: string | number | null) {
  const [first] = extractScaledNumbers(value);
  if (typeof first !== "number" || !Number.isFinite(first)) return null;
  return Math.max(1, Math.round(first));
}

function resolveCurrencyForProduct(
  item: {
    rateUZS?: string | null;
    rateUSD?: string | null;
    rateEUR?: string | null;
  },
  preferredCurrency?: string,
) {
  if (preferredCurrency === "usd" && item.rateUSD) return "USD";
  if (preferredCurrency === "eur" && item.rateEUR) return "EUR";
  if (preferredCurrency === "uzs" && item.rateUZS) return "UZS";
  if (item.rateUZS) return "UZS";
  if (item.rateUSD) return "USD";
  if (item.rateEUR) return "EUR";
  return "UZS";
}

function resolveRateForCurrency(
  item: {
    rateUZS?: string | null;
    rateUSD?: string | null;
    rateEUR?: string | null;
  },
  currency: string,
) {
  if (currency === "USD") return parsePercentValue(item.rateUSD);
  if (currency === "EUR") return parsePercentValue(item.rateEUR);
  return parsePercentValue(item.rateUZS ?? item.rateUSD ?? item.rateEUR ?? null);
}

function resolveRelevantTermMonths(
  item: {
    termWorkingCapital?: string | null;
    termFixedAssets?: string | null;
    termUntargeted?: string | null;
  },
  profile: ReturnType<typeof buildClientPreferenceProfile>,
) {
  const requestedTerm = parseIntegerValue(profile.desiredTerm);
  if (requestedTerm) return requestedTerm;
  return parseIntegerValue(
    getRelevantTerm(item as ProductLike, profile.loanPurpose) ??
      item.termWorkingCapital ??
      item.termFixedAssets ??
      item.termUntargeted ??
      null,
  );
}

function resolveInitialPaymentRatio(profile: ReturnType<typeof buildClientPreferenceProfile>) {
  switch (profile.downPaymentLevel) {
    case "up_to_20":
      return 0.1;
    case "20_to_40":
      return 0.3;
    case "over_40":
      return 0.45;
    default:
      return 0;
  }
}

function resolveGracePeriodMonths(
  item: { gracePeriod?: string | null },
  profile: ReturnType<typeof buildClientPreferenceProfile>,
) {
  if (profile.needsGracePeriod === "no") return 0;
  const detected = parseIntegerValue(item.gracePeriod ?? null);
  if (profile.needsGracePeriod === "yes") {
    return Math.min(detected ?? 3, 6);
  }
  return Math.min(detected ?? 0, 6);
}

function mapNonCreditProduct(
  product: typeof productsTable.$inferSelect,
  language: PdfLanguage,
) {
  return {
    id: product.id,
    productType: "non_credit" as const,
    name: product.name,
    productName: product.name,
    sapCode: null,
    segment: getNonCreditSegmentLabel(language),
    disbursementForm: null,
    loanAmount: null,
    termWorkingCapital: null,
    termFixedAssets: null,
    termUntargeted: null,
    rateUZS: null,
    rateUSD: null,
    rateEUR: null,
    gracePeriod: null,
    purpose: product.description,
    highlight: null,
    isActive: product.isActive,
  };
}

async function getRecommendationCatalog(language: PdfLanguage, needType?: string) {
  const includeCredit = isCreditNeedType(needType);
  const includeNonCredit = isNonCreditNeedType(needType);

  const creditProducts = includeCredit
    ? await db
        .select()
        .from(creditProductsTable)
        .where(eq(creditProductsTable.isActive, true))
        .orderBy(creditProductsTable.number)
    : [];

  const nonCreditProducts = includeNonCredit
    ? await db
        .select()
        .from(productsTable)
        .where(and(eq(productsTable.isActive, true), eq(productsTable.type, "non_credit")))
        .orderBy(productsTable.name)
    : [];

  return [
    ...creditProducts.map((product) => ({ ...product, productType: "credit" as const })),
    ...nonCreditProducts.map((product) => mapNonCreditProduct(product, language)),
  ];
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

async function getDetailedBasketItems(clientId: number): Promise<DetailedBasketItem[]> {
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

  const nonCreditNames = basketItems
    .filter((item) => item.productType === "non_credit")
    .map((item) => item.productName)
    .filter((value, index, array) => value && array.indexOf(value) === index);

  const products = productIds.length > 0
    ? await db
        .select()
        .from(creditProductsTable)
        .where(inArray(creditProductsTable.id, productIds))
    : [];

  const nonCreditProducts = nonCreditNames.length > 0
    ? await db
        .select()
        .from(productsTable)
        .where(
          and(
            eq(productsTable.type, "non_credit"),
            inArray(productsTable.name, nonCreditNames),
          ),
        )
    : [];

  const productMap = new Map(products.map((product) => [product.id, product]));
  const nonCreditMap = new Map(
    nonCreditProducts.map((product) => [product.name, product]),
  );

  return basketItems.map((item) => {
    const product =
      item.productType === "credit" && item.productId
        ? productMap.get(item.productId)
        : undefined;
    const nonCreditProduct =
      item.productType === "non_credit"
        ? nonCreditMap.get(item.productName)
        : undefined;

    const mergedItem: DetailedBasketItem = {
      ...item,
      ...(product
        ? { ...product, productType: "credit" as const }
        : nonCreditProduct
          ? mapNonCreditProduct(nonCreditProduct, "uz")
          : {}),
      productType:
        item.productType === "non_credit" ? "non_credit" : "credit",
      name:
        product?.name ??
        nonCreditProduct?.name ??
        item.productName,
      whySuitable: item.notes || null,
    };

    return mergedItem;
  });
}

function buildProvisionalCalculations(
  basketItems: DetailedBasketItem[],
  profile: ReturnType<typeof buildClientPreferenceProfile>,
  existingCalculations: Array<(typeof calculationsTable.$inferSelect)>,
) {
  const existingProductNames = new Set(
    existingCalculations.map((calculation) => calculation.productName),
  );

  return basketItems
    .filter(
      (item) =>
        item.productType === "credit" &&
        !existingProductNames.has(item.productName || item.name || ""),
    )
    .map((item) => {
      const requestedAmount = parseAmountValue(profile.desiredAmount);
      const termMonths = resolveRelevantTermMonths(item, profile);
      const currency = resolveCurrencyForProduct(item, profile.preferredCurrency);
      const interestRate = resolveRateForCurrency(item, currency);

      if (!requestedAmount || !termMonths || !interestRate) {
        return null;
      }

      const initialPayment = Math.round(
        requestedAmount * resolveInitialPaymentRatio(profile),
      );
      const financedAmount = Math.max(0, requestedAmount - initialPayment);

      if (financedAmount <= 0) {
        return null;
      }

      const provisionalBase = {
        productName: item.productName || item.name || "Product",
        loanAmount: financedAmount.toFixed(2),
        interestRate: interestRate.toFixed(3),
        termMonths,
        repaymentType:
          profile.repaymentPreference === "differentiated"
            ? "differentiated"
            : "annuity",
        initialPayment: initialPayment > 0 ? initialPayment.toFixed(2) : null,
        gracePeriodMonths: resolveGracePeriodMonths(item, profile),
        currency,
      };

      const summary = buildCalculationSummary(provisionalBase);
      if (!summary) {
        return null;
      }

      return {
        ...provisionalBase,
        monthlyPayment: summary.monthlyPayment.toFixed(2),
        totalPayment: summary.totalPayment.toFixed(2),
        totalInterest: summary.totalInterest.toFixed(2),
      };
    })
    .filter(
      (
        item,
      ): item is {
        productName: string;
        loanAmount: string;
        interestRate: string;
        termMonths: number;
        repaymentType: string;
        initialPayment: string | null;
        gracePeriodMonths: number;
        currency: string;
        monthlyPayment: string;
        totalPayment: string;
        totalInterest: string;
      } => item !== null,
    );
}

function resolvePdfLanguage(value: unknown): PdfLanguage {
  return value === "ru" || value === "en" ? value : "uz";
}

async function buildPdfPayload(
  clientId: number,
  user: { id: number },
  language: PdfLanguage,
) {
  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (!client) return null;

  const basketItems = await getDetailedBasketItems(clientId);
  const persistedCalculations = await db
    .select()
    .from(calculationsTable)
    .where(eq(calculationsTable.clientId, clientId))
    .orderBy(desc(calculationsTable.createdAt));

  const answers = await getLatestQuestionnaireAnswers(clientId);
  const profile = buildClientPreferenceProfile(answers, language);
  const preferenceSummary = summarizeClientPreferences(profile, language);
  const localizedBasketItems = basketItems.map((item) => ({
    ...item,
    localizedSegment: null,
    localizedPurpose: null,
    localizedHighlight: null,
    localizedLoanAmount: null,
    localizedRate: null,
    localizedRelevantTerm: null,
    localizedDisbursementForm: null,
    localizedGracePeriod: null,
  }));

  const calculations = [
    ...persistedCalculations,
    ...buildProvisionalCalculations(basketItems, profile, persistedCalculations),
  ];

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
    basketItems: localizedBasketItems,
    calculations,
    preferenceSummary,
    expertName: expert?.name || "-",
    expertTelegramId: expert?.telegramId || null,
    branchName: branch?.name || "-",
    language,
  };
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
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }
  const userId = req.user!.id;
  const branchId = req.user!.branchId;

  const { fullName, phone } = parsed.data;
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

  // Batch-load all related data upfront to avoid N+1 queries
  const allClientIds = clients.map(c => c.id);

  const allDocs = allClientIds.length > 0
    ? await db.select().from(clientDocumentsTable)
        .where(inArray(clientDocumentsTable.clientId, allClientIds))
    : [];

  const allNotes = allClientIds.length > 0
    ? await db.select().from(clientNotesTable)
        .where(inArray(clientNotesTable.clientId, allClientIds))
    : [];

  const allCalcs = allClientIds.length > 0
    ? await db.select().from(calculationsTable)
        .where(inArray(calculationsTable.clientId, allClientIds))
    : [];

  // Build lookup maps keyed by clientId
  const docsMap = new Map<number, typeof allDocs>();
  for (const d of allDocs) {
    const arr = docsMap.get(d.clientId) ?? [];
    arr.push(d);
    docsMap.set(d.clientId, arr);
  }
  const notesMap = new Map<number, typeof allNotes>();
  for (const n of allNotes) {
    const arr = notesMap.get(n.clientId) ?? [];
    arr.push(n);
    notesMap.set(n.clientId, arr);
  }
  const calcsMap = new Map<number, typeof allCalcs>();
  for (const c of allCalcs) {
    if (c.clientId == null) continue;
    const arr = calcsMap.get(c.clientId) ?? [];
    arr.push(c);
    calcsMap.set(c.clientId, arr);
  }

  let text = `=== BARCHA MIJOZLAR EKSPORTI ===\n`;
  text += `Sana: ${formatFileDate()}\n`;
  text += `Jami: ${clients.length}\n\n`;

  for (const client of clients) {
    text += `${"=".repeat(50)}\n`;
    text += `F.I.Sh.: ${client.fullName || "-"}\n`;
    text += `Telefon: ${client.phone || "-"}\n`;
    text += `Holat: ${client.status}\n`;
    text += `Yaratilgan sana: ${formatDateTimeInAppTimeZone(client.createdAt)}\n`;

    const docs = docsMap.get(client.id) ?? [];

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

    const clientNotes = notesMap.get(client.id) ?? [];

    if (clientNotes.length > 0) {
      text += `Izohlar: ${clientNotes.length}\n`;
      for (const n of clientNotes) {
        text += `  - [${formatDateTimeInAppTimeZone(n.createdAt)}] ${n.content}\n`;
      }
    }

    const calcs = calcsMap.get(client.id) ?? [];

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

router.get("/mini-app/clients/:id", requireAuth, requireClientAccess, async (req, res) => {
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

  // All 6 sub-queries are independent — run in parallel to cut latency ~6×.
  const [notes, nextActions, basket, basketItems, calculations, questionnaireAnswers] =
    await Promise.all([
      db
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
        .orderBy(desc(clientNotesTable.createdAt)),
      db
        .select()
        .from(clientNextActionsTable)
        .where(and(eq(clientNextActionsTable.clientId, clientId), eq(clientNextActionsTable.isCompleted, false)))
        .orderBy(clientNextActionsTable.actionDate),
      db
        .select()
        .from(basketsTable)
        .where(and(eq(basketsTable.clientId, clientId), eq(basketsTable.status, "active")))
        .limit(1),
      getDetailedBasketItems(clientId),
      db
        .select()
        .from(calculationsTable)
        .where(eq(calculationsTable.clientId, clientId))
        .orderBy(desc(calculationsTable.createdAt)),
      getLatestQuestionnaireAnswers(clientId),
    ]);

  res.json({
    client,
    notes,
    nextActions,
    basket: basket[0] || null,
    basketItems,
    calculations,
    questionnaireAnswers,
  });
});

router.put("/mini-app/clients/:id", requireAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const parsed = UpdateClientBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }
  const { fullName, phone, status } = parsed.data;

  const updates: Partial<typeof clientsTable.$inferInsert> = { updatedAt: new Date() };
  if (fullName !== undefined) updates.fullName = fullName;
  if (phone !== undefined) updates.phone = phone;
  // Zod narrows `status` to the enum union, but the cross-workspace .d.ts
  // occasionally widens it to `string`. Re-assert the narrower type.
  if (status !== undefined) updates.status = status as ClientStatus;

  const [updated] = await db
    .update(clientsTable)
    .set(updates)
    .where(eq(clientsTable.id, clientId))
    .returning();

  res.json(updated);
});

router.post("/mini-app/clients/:id/notes", requireAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const parsed = NoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }
  const { type, content } = parsed.data;

  const [note] = await db
    .insert(clientNotesTable)
    .values({ clientId, userId: req.user!.id, type: type || "note", content })
    .returning();

  res.json(note);
});

router.post("/mini-app/clients/:id/next-action", requireAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const parsed = NextActionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }
  const { actionType, actionDate, priority, description } = parsed.data;

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

router.put("/mini-app/next-actions/:id/complete", requireAuth, requireNextActionAccess, async (req, res) => {
  const [action] = await db
    .update(clientNextActionsTable)
    .set({ isCompleted: true, updatedAt: new Date() })
    .where(eq(clientNextActionsTable.id, Number(req.params.id)))
    .returning();

  res.json(action);
});

router.post("/mini-app/questionnaire", requireAuth, requireClientAccessFromBody("clientId"), async (req, res) => {
  const parsed = QuestionnaireBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }
  const { clientId, answers, clearBasket } = parsed.data;

  const session = await db.transaction(async (tx) => {
    const [createdSession] = await tx
      .insert(questionnaireSessionsTable)
      .values({
        clientId,
        userId: req.user!.id,
        status: "completed",
        completedAt: new Date(),
      })
      .returning();

    if (answers && Array.isArray(answers) && answers.length > 0) {
      await tx.insert(questionnaireAnswersTable).values(
        answers.map(a => ({
          sessionId: createdSession.id,
          questionKey: a.questionKey,
          answer: a.answer,
        }))
      );
    }

    if (clearBasket) {
      await tx
        .update(basketsTable)
        .set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(basketsTable.clientId, clientId), eq(basketsTable.status, "active")));
    }

    await tx
      .update(clientsTable)
      .set({ status: "questionnaire", updatedAt: new Date() })
      .where(eq(clientsTable.id, clientId));

    return createdSession;
  });

  res.json(session);
});

router.post("/mini-app/recommend", requireAuth, requireClientAccessFromBody("clientId", { optional: true }), async (req, res) => {
  const parsed = RecommendBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }
  const { clientId, answers } = parsed.data;
  const language = resolvePdfLanguage(parsed.data.language);
  const answerList = Array.isArray(answers) ? answers : [];
  const profile = buildClientPreferenceProfile(answerList, language);

  const allProducts = await getRecommendationCatalog(language, profile.needType);

  let recommended = allProducts;

  if (profile.businessSize) {
    const aliases = getSegmentAliases(profile.businessSize);
    const filtered = recommended.filter((product) => {
      const segment = product.segment?.toLowerCase() || "";
      return aliases.some((alias) => segment.includes(alias));
    });
    if (filtered.length > 0) recommended = filtered;
  }

  if (isCreditNeedType(profile.needType)) {
    if (profile.loanPurpose === "working_capital") {
      recommended = recommended.filter(
        (product) =>
          product.productType !== "credit" || Boolean(product.termWorkingCapital),
      );
    } else if (profile.loanPurpose === "fixed_assets") {
      recommended = recommended.filter(
        (product) =>
          product.productType !== "credit" || Boolean(product.termFixedAssets),
      );
    } else if (profile.loanPurpose === "untargeted") {
      recommended = recommended.filter(
        (product) =>
          product.productType !== "credit" || Boolean(product.termUntargeted),
      );
    }
  }

  const enrichedRecommended = recommended.map((product) => ({
    ...product,
    whySuitable: buildRecommendationNote(product as ProductLike, profile, language),
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

router.post("/mini-app/basket", requireAuth, requireClientAccessFromBody("clientId"), async (req, res) => {
  const parsed = BasketBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }
  const { clientId, items } = parsed.data;

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

  if (items && Array.isArray(items) && items.length > 0) {
    await db.insert(basketItemsTable).values(
      items.map(item => ({
        basketId,
        productId:
          item.productType === "non_credit" ? null : item.productId || null,
        productType: item.productType || "credit",
        productName: item.productName,
        notes: item.notes || null,
      }))
    );
  }

  await db
    .update(clientsTable)
    .set({ status: "basket", updatedAt: new Date() })
    .where(eq(clientsTable.id, clientId));

  res.json({ basketId });
});

router.post("/mini-app/calculate", requireAuth, requireClientAccessFromBody("clientId", { optional: true }), async (req, res) => {
  try {
  const calcParsed = CalculateBody.safeParse(req.body);
  if (!calcParsed.success) { res.status(400).json({ error: "Invalid body", details: calcParsed.error }); return; }
  const {
    clientId,
    productName,
    loanAmount: submittedLoanAmount,
    interestRate,
    termMonths,
    repaymentType,
    initialPayment,
    gracePeriodMonths,
    currency,
    productCost,
    downPaymentPct,
  } = calcParsed.data;

  // Server-side recalculation: if productCost is provided, derive loanAmount
  // from it instead of trusting the client-submitted value.
  let loanAmount = submittedLoanAmount;
  if (productCost != null && productCost > 0) {
    const dpPct = Math.min(100, Math.max(0, downPaymentPct ?? 0));
    const downPaymentAmount = productCost * (dpPct / 100);
    loanAmount = productCost - downPaymentAmount;
  }

  const principal = Number(loanAmount);
  const initialPay = Math.max(0, Number(initialPayment) || 0);
  const effectivePrincipal = Math.max(0, principal - initialPay);
  const monthlyRate = Number(interestRate) / 100 / 12;
  const term = Number(termMonths);

  if (!Number.isFinite(principal) || principal <= 0 || !Number.isInteger(term) || term <= 0) {
    res.status(400).json({ error: "Invalid loan parameters" });
    return;
  }
  if (!Number.isFinite(monthlyRate) || monthlyRate < 0) {
    res.status(400).json({ error: "Invalid interest rate" });
    return;
  }

  const grace = Math.min(Math.max(0, Number(gracePeriodMonths) || 0), term - 1);
  const paymentTerm = Math.max(1, term - grace);

  let monthlyPayment: number;
  let totalPayment: number;
  let totalInterest: number;
  const schedule: any[] = [];

  if (repaymentType === "differentiated") {
    const principalPayment = effectivePrincipal / paymentTerm;
    let remaining = effectivePrincipal;
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
    monthlyPayment = principalPayment + effectivePrincipal * monthlyRate;
  } else {
    let remaining = effectivePrincipal;
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

    if (monthlyRate === 0) {
      monthlyPayment = effectivePrincipal / paymentTerm;
    } else {
      const annuityCoeff = (monthlyRate * Math.pow(1 + monthlyRate, paymentTerm)) / (Math.pow(1 + monthlyRate, paymentTerm) - 1);
      monthlyPayment = effectivePrincipal * annuityCoeff;
    }

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
      productName: productName ?? "Untitled calculation",
      loanAmount: principal.toString(),
      interestRate: String(interestRate),
      termMonths: term,
      repaymentType: repaymentType || "annuity",
      initialPayment: initialPay.toString(),
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
      principal: +effectivePrincipal.toFixed(2),
    },
  });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Calculation failed" });
  }
});

router.get("/mini-app/products", requireAuth, async (req, res) => {
  const needType =
    typeof req.query.needType === "string" ? req.query.needType : undefined;
  const products = await getRecommendationCatalog("uz", needType);

  res.json(products);
});

router.get("/mini-app/credit-lines", requireAuth, async (_req, res) => {
  const rows = await db
    .select()
    .from(creditLinesTable)
    .orderBy(creditLinesTable.number, creditLinesTable.id);

  res.json(rows);
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

  // Single aggregate query instead of 3 queries per worker (N+1 fix)
  const workerIds = workers.map(w => w.id);
  const workerClientStats = workerIds.length > 0
    ? await db
        .select({
          assignedToId: clientsTable.assignedToId,
          totalClients: count(),
          monthClients: sql<number>`count(*) filter (where ${clientsTable.createdAt} >= ${monthStart})`,
          completedClients: sql<number>`count(*) filter (where ${clientsTable.status} = 'completed')`,
        })
        .from(clientsTable)
        .where(inArray(clientsTable.assignedToId, workerIds))
        .groupBy(clientsTable.assignedToId)
    : [];

  const statsMap = new Map(workerClientStats.map(s => [s.assignedToId, s]));

  const workerStats = workers.map(w => ({
    ...w,
    totalClients: statsMap.get(w.id)?.totalClients ?? 0,
    monthClients: statsMap.get(w.id)?.monthClients ?? 0,
    completedClients: statsMap.get(w.id)?.completedClients ?? 0,
  }));

  const [branchTotal] = await db
    .select({ count: count() })
    .from(clientsTable)
    .where(eq(clientsTable.branchId, branchId));

  res.json({ workers: workerStats, totalBranchClients: branchTotal.count });
});

router.post("/mini-app/clients/:id/documents", requireAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const docParsed = DocumentBody.safeParse(req.body);
  if (!docParsed.success) { res.status(400).json({ error: "Invalid body", details: docParsed.error }); return; }
  const { docType, fileName, storagePath, ocrText, extractedData } = docParsed.data;
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

router.get("/mini-app/clients/:id/documents", requireAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const docs = await db
    .select()
    .from(clientDocumentsTable)
    .where(eq(clientDocumentsTable.clientId, clientId))
    .orderBy(desc(clientDocumentsTable.createdAt));
  res.json(docs);
});

router.put("/mini-app/documents/:id/ocr", requireAuth, requireDocumentAccess, async (req, res) => {
  const docId = Number(req.params.id);
  const ocrParsed = OcrUpdateBody.safeParse(req.body);
  if (!ocrParsed.success) { res.status(400).json({ error: "Invalid body", details: ocrParsed.error }); return; }
  const { ocrText, extractedData } = ocrParsed.data;
  const [updated] = await db
    .update(clientDocumentsTable)
    .set({ ocrText, extractedData })
    .where(eq(clientDocumentsTable.id, docId))
    .returning();
  if (!updated) { res.status(404).json({ error: "Document not found" }); return; }
  res.json(updated);
});

router.delete("/mini-app/documents/:id", requireAuth, requireDocumentAccess, async (req, res) => {
  const docId = Number(req.params.id);
  const [deleted] = await db
    .delete(clientDocumentsTable)
    .where(eq(clientDocumentsTable.id, docId))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Document not found" }); return; }
  res.json({ success: true });
});

router.post("/mini-app/clients/:id/generate-pdf", requireAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const user = req.user!;
  const pdfParsed = GeneratePdfBody.safeParse(req.body);
  if (!pdfParsed.success) { res.status(400).json({ error: "Invalid body", details: pdfParsed.error }); return; }
  const sendViaTelegram = pdfParsed.data.sendViaTelegram !== false;
  const telegramInitData = typeof pdfParsed.data.telegramInitData === "string"
    ? pdfParsed.data.telegramInitData.trim()
    : "";

  const language = resolvePdfLanguage(pdfParsed.data.language);
  const payload = await buildPdfPayload(clientId, user, language);
  if (!payload) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  // Guard: refuse to emit a PDF for a client whose active basket is empty.
  // Without this check the expert receives a KP with no products attached.
  const [activeBasket] = await db
    .select({ id: basketsTable.id })
    .from(basketsTable)
    .where(and(eq(basketsTable.clientId, clientId), eq(basketsTable.status, "active")))
    .limit(1);
  const basketItemCount = activeBasket
    ? (await db
        .select({ count: count() })
        .from(basketItemsTable)
        .where(eq(basketItemsTable.basketId, activeBasket.id)))[0]?.count ?? 0
    : 0;
  if (!activeBasket || basketItemCount === 0) {
    res.status(400).json({ error: "Basket is empty", code: "basket_empty" });
    return;
  }

  try {
    const pdfBuffer = await generateClientPdf({
      ...payload,
      offerSummary: null,
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

    // If caller asked for Telegram delivery but it failed (no target or send returned false),
    // do NOT advance client.status — surface the failure so the UI can retry.
    if (sendViaTelegram && !telegramSent) {
      res.status(502).json({
        error: "Telegram delivery failed",
        code: "telegram_delivery_failed",
        telegramSent: false,
        pdfSize: pdfBuffer.length,
      });
      return;
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

router.post(
  "/mini-app/exports/auto-excel",
  requireAuth,
  requireClientAccessFromBody("clientId", { optional: true }),
  async (req, res) => {
  const autoParsed = AutoExcelBody.safeParse(req.body);
  if (!autoParsed.success) {
    res.status(400).json({ error: "Invalid body", details: autoParsed.error });
    return;
  }
  const extractedData = autoParsed.data.extractedData ?? {};
  const ocrText = autoParsed.data.ocrText ?? "";
  const imageCount = autoParsed.data.imageCount ?? 0;
  const clientId = autoParsed.data.clientId ?? null;

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

router.get("/mini-app/clients/:id/download-pdf", requireAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const language = resolvePdfLanguage(req.query.language);

  const payload = await buildPdfPayload(clientId, req.user!, language);
  if (!payload) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  try {
    const pdfBuffer = await generateClientPdf({
      ...payload,
      offerSummary: null,
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

router.get("/mini-app/clients/:id/export", requireAuth, requireClientAccess, async (req, res) => {
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

  const [docs, clientNotes, calcs] = await Promise.all([
    db.select().from(clientDocumentsTable)
      .where(eq(clientDocumentsTable.clientId, clientId))
      .orderBy(desc(clientDocumentsTable.createdAt)),
    db.select().from(clientNotesTable)
      .where(eq(clientNotesTable.clientId, clientId)),
    db.select().from(calculationsTable)
      .where(eq(calculationsTable.clientId, clientId)),
  ]);

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



