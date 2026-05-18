import { Router, type IRouter } from "express";
import {
  db,
  clientsTable,
  usersTable,
  articlesTable,
  articleVisibilityTable,
  basketsTable,
  basketItemsTable,
  calculationsTable,
  creditLinesTable,
  recommendationDocumentsTable,
  matchKnowledgeDocs,
  eq,
  and,
  asc,
  desc,
  or,
  guestAuth,
  buildClientPreferenceProfile,
  buildRecommendationNote,
  getRateSummary,
  getRelevantTerm,
  isCreditNeedType,
  buildCalculationSummary,
  buildPaymentSchedule,
  requireClientAccessFromBody,
  logger,
  MiniAppBasketBody,
  MiniAppCalculateBody,
  MiniAppRecommendBody,
  badRequest,
  INVALID_BODY_ERROR,
  getSegmentAliases,
  getRecommendationCatalog,
  resolvePdfLanguage,
} from "./_shared";
import type {
  ProductLike,
} from "./_shared";

const router: IRouter = Router();
router.post("/mini-app/recommend", guestAuth, requireClientAccessFromBody("clientId"), async (req, res) => {
  const parsed = MiniAppRecommendBody.safeParse(req.body);
  if (!parsed.success) {
    // SKIP(PR-E1.5): bespoke envelope uses `issues:` field (not `details:`)
    res.status(400).json({ error: INVALID_BODY_ERROR, issues: parsed.error.flatten() });
    return;
  }
  const { clientId, answers, language: rawLanguage } = parsed.data;
  const language = resolvePdfLanguage(rawLanguage);
  const profile = buildClientPreferenceProfile(answers, language);

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

  await db
    .update(clientsTable)
    .set({ status: "recommendation", updatedAt: new Date() })
    .where(eq(clientsTable.id, clientId));

  // Match knowledge-base docs to the request: any doc whose tag matches the
  // profile (need type, business size, loan purpose) or one of the
  // recommended products' segments shows up under "related knowledge".
  let allDocs: (typeof recommendationDocumentsTable.$inferSelect)[] = [];
  try {
    allDocs = await db
      .select()
      .from(recommendationDocumentsTable)
      .where(eq(recommendationDocumentsTable.isActive, true))
      .orderBy(asc(recommendationDocumentsTable.sortOrder));
  } catch (err) {
    logger.warn({ err }, "Recommendation knowledge lookup failed; continuing without related docs");
  }
  const productSegments = enrichedRecommended
    .map((p) => p.segment)
    .filter((s): s is string => typeof s === "string" && s.length > 0);
  const relatedKnowledge = matchKnowledgeDocs(
    allDocs,
    [profile.needType, profile.businessSize, profile.loanPurpose, ...productSegments],
    5,
  );

  res.json({
    recommended: enrichedRecommended,
    preferenceProfile: profile,
    total: allProducts.length,
    recommendedCount: enrichedRecommended.length,
    relatedKnowledge,
  });
});


router.post("/mini-app/basket", guestAuth, requireClientAccessFromBody("clientId"), async (req, res) => {
  const parsed = MiniAppBasketBody.safeParse(req.body);
  if (!parsed.success) {
    // SKIP(PR-E1.5): bespoke envelope uses `issues:` field (not `details:`)
    res.status(400).json({ error: INVALID_BODY_ERROR, issues: parsed.error.flatten() });
    return;
  }
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

  for (const item of items) {
    await db.insert(basketItemsTable).values({
      basketId,
      productId:
        item.productType === "non_credit" ? null : item.productId || null,
      productType: item.productType,
      productName: item.productName,
      notes: item.notes || null,
    });
  }

  await db
    .update(clientsTable)
    .set({ status: "basket", updatedAt: new Date() })
    .where(eq(clientsTable.id, clientId));

  res.json({ basketId });
});


router.post("/mini-app/calculate", guestAuth, requireClientAccessFromBody("clientId", { optional: true }), async (req, res) => {
  const parsed = MiniAppCalculateBody.safeParse(req.body);
  if (!parsed.success) {
    // SKIP(PR-E1.5): bespoke envelope uses `issues:` field (not `details:`)
    res.status(400).json({ error: INVALID_BODY_ERROR, issues: parsed.error.flatten() });
    return;
  }
  const {
    clientId,
    productName,
    loanAmount,
    interestRate,
    termMonths,
    repaymentType = "annuity",
    initialPayment = 0,
    gracePeriodMonths = 0,
    currency = "UZS",
    feeOnceAmount = 0,
    feeMonthlyPct = 0,
    insuranceMonthlyPct = 0,
  } = parsed.data;

  const principal = loanAmount - initialPayment;
  if (principal <= 0 || gracePeriodMonths >= termMonths) {
    badRequest(res, INVALID_BODY_ERROR);
    return;
  }

  const calculationInput = {
    loanAmount: principal,
    interestRate,
    termMonths,
    repaymentType,
    gracePeriodMonths,
    feeOnceAmount,
    feeMonthlyPct,
    insuranceMonthlyPct,
  };
  const summary = buildCalculationSummary(calculationInput);
  if (!summary) {
    badRequest(res, INVALID_BODY_ERROR);
    return;
  }
  const schedule = buildPaymentSchedule(calculationInput);

  const [calc] = await db
    .insert(calculationsTable)
    .values({
      clientId: clientId ?? null,
      userId: req.user!.id,
      productName: productName || "Расчёт кредита / Kredit hisobi",
      loanAmount: principal.toString(),
      interestRate: interestRate.toString(),
      termMonths,
      repaymentType,
      initialPayment: initialPayment.toString(),
      gracePeriodMonths,
      monthlyPayment: summary.monthlyPayment.toFixed(2),
      totalPayment: summary.totalPayment.toFixed(2),
      totalInterest: summary.totalInterest.toFixed(2),
      currency,
    })
    .returning();

  res.json({
    calculation: calc,
    schedule,
    summary,
  });
});


router.get("/mini-app/products", guestAuth, async (req, res) => {
  const needType =
    typeof req.query.needType === "string" ? req.query.needType : undefined;
  const products = await getRecommendationCatalog("uz", needType);

  res.json(products);
});


router.get("/mini-app/credit-lines", guestAuth, async (_req, res) => {
  const rows = await db
    .select()
    .from(creditLinesTable)
    .orderBy(creditLinesTable.number, creditLinesTable.id);

  const mapped = rows.map((r) => ({
    ...r,
    agreementAmount: r.agreementAmount !== null ? Number(r.agreementAmount) : null,
    receivedAmount: r.receivedAmount !== null ? Number(r.receivedAmount) : null,
    disbursedAmount: r.disbursedAmount !== null ? Number(r.disbursedAmount) : null,
    remainingBalance: r.remainingBalance !== null ? Number(r.remainingBalance) : null,
  }));

  res.json(mapped);
});


router.get("/mini-app/articles", guestAuth, async (req, res) => {
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


export default router;
