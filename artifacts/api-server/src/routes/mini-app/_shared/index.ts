import { db } from "@workspace/db";
import XLSX from "xlsx";
import { randomUUID } from "crypto";
import {
  clientsTable,
  type ClientStatus,
  usersTable,
  branchesTable,
  creditProductsTable,
  productsTable,
  articlesTable,
  articleVisibilityTable,
  clientNotesTable,
  clientNextActionsTable,
  basketsTable,
  basketItemsTable,
  calculationsTable,
  clientDocumentsTable,
  creditLinesTable,
  collateralEstimatesTable,
  collateralEstimateItemsTable,
  collateralItemsTable,
  collateralTypesTable,
  recommendationDocumentsTable,
} from "@workspace/db";
import { matchKnowledgeDocs } from "../../../lib/knowledge-match";
import { enqueueEspoSync } from "../../../lib/espo-enqueue";
import { eq, and, asc, desc, count, gte, lte, or, inArray } from "drizzle-orm";
import { guestAuth } from "../../../middleware/auth";
import { generateClientPdf } from "../../../pdf/generate";
import { generateLeaveBehindPdf, type LeaveBehindInput } from "../../../pdf/leave-behind";
import { sendDocument } from "../../../bot";
import { validateTelegramInitData } from "../../../lib/telegram";
import {
  formatDateTimeInAppTimeZone,
  formatFileDate,
  startOfAppDay,
  startOfAppMonth,
} from "../../../lib/timezone";
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
} from "../../../lib/recommendation";
import { buildCalculationSummary, buildPaymentSchedule } from "../../../lib/calculations";
import {
  isAllowedStatusTransition,
  isApplicationFrozen,
  transitionClientStatus,
  StatusTransitionError,
} from "../../../lib/client-status-machine";
import { validateExtractedData } from "../../../lib/uz-doc-validation";
import {
  requireClientAccess,
  requireClientAccessFromBody,
  requireDocumentAccess,
  requireNextActionAccess,
  verifyClientAccess,
} from "../../../lib/client-access";
import { logger } from "../../../lib/logger";
import { getR2 } from "../../../storage/r2-client";
import {
  MiniAppBasketBody,
  MiniAppCalculateBody,
  MiniAppCreateClientBody,
  MiniAppDocumentBody,
  MiniAppGeneratePdfBody,
  MiniAppNextActionBody,
  MiniAppNoteBody,
  MiniAppOcrUpdateBody,
  MiniAppAutoExcelBody,
  MiniAppRecommendBody,
  MiniAppUpdateClientBody,
} from "@workspace/api-zod";
import { badRequest, forbidden, notFound, conflict, internalServerError } from "../../../lib/errors";


export {
  db,
  XLSX,
  randomUUID,
  clientsTable,
  usersTable,
  branchesTable,
  creditProductsTable,
  productsTable,
  articlesTable,
  articleVisibilityTable,
  clientNotesTable,
  clientNextActionsTable,
  basketsTable,
  basketItemsTable,
  calculationsTable,
  clientDocumentsTable,
  creditLinesTable,
  collateralEstimatesTable,
  collateralEstimateItemsTable,
  collateralItemsTable,
  collateralTypesTable,
  recommendationDocumentsTable,
  matchKnowledgeDocs,
  enqueueEspoSync,
  eq,
  and,
  asc,
  desc,
  count,
  gte,
  lte,
  or,
  inArray,
  guestAuth,
  generateClientPdf,
  generateLeaveBehindPdf,
  sendDocument,
  validateTelegramInitData,
  formatDateTimeInAppTimeZone,
  formatFileDate,
  startOfAppDay,
  startOfAppMonth,
  buildClientPreferenceProfile,
  buildRecommendationNote,
  getRateSummary,
  getRelevantTerm,
  isCreditNeedType,
  isNonCreditNeedType,
  summarizeClientPreferences,
  buildCalculationSummary,
  buildPaymentSchedule,
  isAllowedStatusTransition,
  isApplicationFrozen,
  transitionClientStatus,
  StatusTransitionError,
  validateExtractedData,
  requireClientAccess,
  requireClientAccessFromBody,
  requireDocumentAccess,
  requireNextActionAccess,
  verifyClientAccess,
  logger,
  getR2,
  MiniAppBasketBody,
  MiniAppCalculateBody,
  MiniAppCreateClientBody,
  MiniAppDocumentBody,
  MiniAppGeneratePdfBody,
  MiniAppNextActionBody,
  MiniAppNoteBody,
  MiniAppOcrUpdateBody,
  MiniAppAutoExcelBody,
  MiniAppRecommendBody,
  MiniAppUpdateClientBody,
  badRequest,
  forbidden,
  notFound,
  conflict,
  internalServerError,
};
export type {
  ClientStatus,
  LeaveBehindInput,
  ProductLike,
  QuestionnaireAnswer,
};

export const adminRoles = ["superadmin", "head_office_admin"];
export type PdfLanguage = "ru" | "uz";

export const INVALID_BODY_ERROR = "Некорректные данные / Noto'g'ri ma'lumot";

export async function persistGeneratedClientDocument({
  clientId,
  userId,
  buffer,
  fileName,
  docType,
  mimeType,
}: {
  clientId: number;
  userId: number;
  buffer: Buffer;
  fileName: string;
  docType: string;
  mimeType: string;
}) {
  if (process.env.STORAGE_BACKEND !== "r2") return null;

  const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const storagePath = `clients/${clientId}/generated/${randomUUID()}.${extension}`;

  try {
    await getR2().upload({
      key: storagePath,
      body: buffer,
      contentType: mimeType,
    });

    const [doc] = await db
      .insert(clientDocumentsTable)
      .values({
        clientId,
        userId,
        docType,
        fileName,
        storagePath,
        mimeType,
        sizeBytes: buffer.length,
      })
      .returning();

    return doc;
  } catch (error) {
    logger.error({ err: error, clientId, fileName, docType }, "Failed to persist generated client document");
    return null;
  }
}

export interface DetailedBasketItem extends ProductLike {
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

export function getSegmentAliases(value?: string | null) {
  if (!value) return [];

  const normalized = value.toLowerCase();
  const aliasMap: Record<string, string[]> = {
    micro: ["micro", "mikro", "микро"],
    small: ["small", "kichik", "малый", "малый бизнес", "small business"],
    medium: ["medium", "o'rta", "средний", "middle"],
  };

  return aliasMap[normalized] || [normalized];
}

export function getNonCreditSegmentLabel(language: PdfLanguage) {
  if (language === "ru") return "Некредитный продукт";
  return "Nokredit mahsulot";
}

export function extractScaledNumbers(value?: string | number | null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return [value];
  }

  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }

  const normalized = value.toLowerCase().replace(/\u00a0/g, " ");
  const matches = Array.from(
    normalized.matchAll(/(\d[\d\s]*(?:[.,]\d+)?)/g),
  );

  return matches
    .map((match) => {
      const raw = match[1].replace(/\s+/g, "").replace(",", ".");
      const parsed = Number.parseFloat(raw);
      if (!Number.isFinite(parsed)) return null;

      const suffix = normalized.slice(match.index ?? 0, (match.index ?? 0) + 24);
      const multiplier =
        /\b(млрд|milliard|billion|bn)\b/.test(suffix)
          ? 1_000_000_000
          : /\b(млн|million|mln)\b/.test(suffix)
          ? 1_000_000
          : /\b(тыс|thousand|ming)\b/.test(suffix)
            ? 1_000
            : 1;

      return parsed * multiplier;
    })
    .filter((item): item is number => item !== null);
}

export function parseAmountValue(value?: string | number | null) {
  const [first] = extractScaledNumbers(value);
  return typeof first === "number" && Number.isFinite(first) ? first : null;
}

export function resolveRequestedAmount(
  item: {
    loanAmount?: string | null;
  },
  profile: ReturnType<typeof buildClientPreferenceProfile>,
) {
  const requestedAmount = parseAmountValue(profile.desiredAmount);
  if (requestedAmount) return requestedAmount;
  return parseAmountValue(item.loanAmount ?? null);
}

export function parsePercentValue(value?: string | null) {
  if (!value) return null;
  const percentMatch = value.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (percentMatch) {
    return Number.parseFloat(percentMatch[1].replace(",", "."));
  }

  const [first] = extractScaledNumbers(value);
  return typeof first === "number" && Number.isFinite(first) ? first : null;
}

export function parseIntegerValue(value?: string | number | null) {
  const [first] = extractScaledNumbers(value);
  if (typeof first !== "number" || !Number.isFinite(first)) return null;
  return Math.max(1, Math.round(first));
}

export function resolveCurrencyForProduct(
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

export function resolveRateForCurrency(
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

export function resolveRelevantTermMonths(
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

export function resolveInitialPaymentRatio(profile: ReturnType<typeof buildClientPreferenceProfile>) {
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

export function resolveGracePeriodMonths(
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

export function mapNonCreditProduct(
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

export async function getRecommendationCatalog(language: PdfLanguage, needType?: string) {
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

// Phase B3a: the legacy questionnaire_* tables were renamed to archived_* and
// no longer participate in the live funnel. The fixed lead-form on /new-client
// writes its answers directly onto clientsTable, so we synthesize the
// preference-answer array from the client row to keep buildClientPreferenceProfile
// (and the downstream PDF / recommendation pipeline) working unchanged.
export async function getClientPreferenceAnswers(clientId: number): Promise<QuestionnaireAnswer[]> {
  const [client] = await db
    .select({
      clientSegment: clientsTable.clientSegment,
      purpose: clientsTable.purpose,
      desiredAmountUzs: clientsTable.desiredAmountUzs,
      desiredTermMonths: clientsTable.desiredTermMonths,
      preferredCurrency: clientsTable.preferredCurrency,
    })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (!client) return [];

  const answers: QuestionnaireAnswer[] = [];
  if (client.clientSegment) {
    answers.push({ questionKey: "business_size", answer: client.clientSegment });
  }
  if (client.purpose) {
    answers.push({ questionKey: "loan_purpose", answer: client.purpose });
  }
  if (client.desiredAmountUzs !== null && client.desiredAmountUzs !== undefined) {
    answers.push({ questionKey: "desired_amount", answer: String(client.desiredAmountUzs) });
  }
  if (client.desiredTermMonths !== null && client.desiredTermMonths !== undefined) {
    answers.push({ questionKey: "desired_term", answer: String(client.desiredTermMonths) });
  }
  if (client.preferredCurrency) {
    // Profile labels keep currency codes lowercase (uzs/usd/eur); the column
    // stores them uppercase per preferredCurrencySchema.
    answers.push({ questionKey: "preferred_currency", answer: client.preferredCurrency.toLowerCase() });
  }
  return answers;
}

export async function getDetailedBasketItems(clientId: number): Promise<DetailedBasketItem[]> {
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

export function buildProvisionalCalculations(
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
      const requestedAmount = resolveRequestedAmount(item, profile);
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

export function resolvePdfLanguage(value: unknown): PdfLanguage {
  return value === "ru" ? "ru" : "uz";
}

// Phase D2: PDF endpoints prefer the client's saved preferredLanguage when no
// explicit language is in the request. Defaults to "ru" when neither side has
// expressed a preference (matches the leave-behind PDF generator default).
export function resolvePdfLanguageForClient(
  requestValue: unknown,
  clientPreferred: string | null | undefined,
): PdfLanguage {
  const candidate =
    requestValue === "ru" || requestValue === "uz"
      ? requestValue
      : clientPreferred ?? "ru";
  return candidate === "uz" ? "uz" : "ru";
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getPurposeLabel(value: string | null | undefined, language: PdfLanguage) {
  const labels: Record<PdfLanguage, Record<string, string>> = {
    ru: {
      working_capital: "Пополнение оборотных средств",
      fixed_assets: "Покупка основных средств",
      untargeted: "Свободное использование",
      not_sure: "Не определено",
    },
    uz: {
      working_capital: "Aylanma mablag'larni to'ldirish",
      fixed_assets: "Asosiy vositalarni sotib olish",
      untargeted: "Maqsadsiz foydalanish",
      not_sure: "Aniqlanmagan",
    },
  };
  if (!value) return null;
  return labels[language][value] ?? value;
}

export async function buildLeaveBehindDetails(
  clientId: number,
  client: typeof clientsTable.$inferSelect,
  language: PdfLanguage,
): Promise<Pick<LeaveBehindInput, "offer" | "collateral">> {
  const [latestCalculation] = await db
    .select({
      productName: calculationsTable.productName,
      loanAmount: calculationsTable.loanAmount,
      interestRate: calculationsTable.interestRate,
      termMonths: calculationsTable.termMonths,
      monthlyPayment: calculationsTable.monthlyPayment,
      currency: calculationsTable.currency,
    })
    .from(calculationsTable)
    .where(eq(calculationsTable.clientId, clientId))
    .orderBy(desc(calculationsTable.createdAt))
    .limit(1);

  const [basketCredit] = await db
    .select({ productName: basketItemsTable.productName })
    .from(basketsTable)
    .innerJoin(basketItemsTable, eq(basketItemsTable.basketId, basketsTable.id))
    .where(
      and(
        eq(basketsTable.clientId, clientId),
        eq(basketsTable.status, "active"),
        eq(basketItemsTable.productType, "credit"),
      ),
    )
    .orderBy(desc(basketItemsTable.createdAt))
    .limit(1);

  const offer: LeaveBehindInput["offer"] = {
    productName: latestCalculation?.productName ?? basketCredit?.productName ?? null,
    purpose: getPurposeLabel(client.purpose, language),
    amountUzs: toFiniteNumber(latestCalculation?.loanAmount) ?? toFiniteNumber(client.desiredAmountUzs),
    termMonths: latestCalculation?.termMonths ?? client.desiredTermMonths ?? null,
    interestRate: toFiniteNumber(latestCalculation?.interestRate),
    monthlyPaymentUzs: toFiniteNumber(latestCalculation?.monthlyPayment),
    currency: latestCalculation?.currency ?? client.preferredCurrency ?? "UZS",
  };

  const hasOffer = [
    offer.productName,
    offer.purpose,
    offer.amountUzs,
    offer.termMonths,
    offer.interestRate,
    offer.monthlyPaymentUzs,
  ].some((value) => value !== null && value !== undefined && value !== "");

  const [latestEstimate] = await db
    .select()
    .from(collateralEstimatesTable)
    .where(eq(collateralEstimatesTable.clientId, clientId))
    .orderBy(desc(collateralEstimatesTable.createdAt))
    .limit(1);

  let collateral: LeaveBehindInput["collateral"] = null;
  if (latestEstimate) {
    const estimateItems = await db
      .select({
        title: collateralItemsTable.title,
        typeNameRu: collateralTypesTable.nameRu,
        typeNameUz: collateralTypesTable.nameUz,
      })
      .from(collateralEstimateItemsTable)
      .innerJoin(
        collateralItemsTable,
        eq(collateralEstimateItemsTable.collateralItemId, collateralItemsTable.id),
      )
      .innerJoin(
        collateralTypesTable,
        eq(collateralItemsTable.collateralTypeId, collateralTypesTable.id),
      )
      .where(eq(collateralEstimateItemsTable.estimateId, latestEstimate.id));

    collateral = {
      acceptedValueUzs: toFiniteNumber(latestEstimate.totalAcceptedValue),
      coveragePercent: toFiniteNumber(latestEstimate.coveragePercent),
      maxLoanAmountUzs: toFiniteNumber(latestEstimate.maxLoanAmount),
      resultStatus: latestEstimate.resultStatus as "enough" | "not_enough",
      items: estimateItems.map((item) => {
        const typeName = language === "ru" ? item.typeNameRu : (item.typeNameUz ?? item.typeNameRu);
        return `${item.title} (${typeName})`;
      }),
    };
  }

  return {
    offer: hasOffer ? offer : null,
    collateral,
  };
}

export function getAutoExcelCopy(language: PdfLanguage) {
  if (language === "ru") {
    return {
      sheetSummary: "Сводка",
      sheetFields: "Данные",
      sheetVehicle: "Авто",
      sheetOcr: "Текст",
      exportedAt: "Время выгрузки",
      documentType: "Тип документа",
      imageCount: "Количество фото",
      clientBlock: "— Клиент —",
      clientId: "Идентификатор клиента",
      fullName: "ФИО",
      phone: "Телефон",
      status: "Статус",
      createdAt: "Дата создания",
      branch: "Филиал",
      expertBlock: "— Кредитный эксперт —",
      expertId: "Идентификатор эксперта",
      name: "Имя",
      role: "Роль",
      field: "Поле",
      value: "Значение",
      recognizedText: "Распознанный текст",
      filePrefix: "dokument",
      previewName: "prosmotr",
      vehicleFields: {
        make: "Марка",
        model: "Модель",
        vehicleType: "Тип авто",
        color: "Цвет",
        plateText: "Гос. номер",
        approximateYear: "Примерный год",
        vin: "VIN",
        visibleConditionNotes: "Заметки о состоянии",
        confidence: "Уверенность",
        rawNotes: "Доп. заметки",
      },
    } as const;
  }

  return {
    sheetSummary: "Xulosa",
    sheetFields: "Ma'lumotlar",
    sheetVehicle: "Avto",
    sheetOcr: "Matn",
    exportedAt: "Yuklangan vaqt",
    documentType: "Hujjat turi",
    imageCount: "Suratlar soni",
    clientBlock: "— Mijoz —",
    clientId: "Mijoz identifikatori",
    fullName: "F.I.Sh.",
    phone: "Telefon",
    status: "Holat",
    createdAt: "Yaratilgan sana",
    branch: "Filial",
    expertBlock: "— Kredit eksperti —",
    expertId: "Ekspert identifikatori",
    name: "Ism",
    role: "Rol",
    field: "Maydon",
    value: "Qiymat",
    recognizedText: "Tanilgan matn",
    filePrefix: "hujjat",
    previewName: "korish",
    vehicleFields: {
      make: "Marka",
      model: "Model",
      vehicleType: "Avto turi",
      color: "Rang",
      plateText: "Davlat raqami",
      approximateYear: "Taxminiy yil",
      vin: "VIN",
      visibleConditionNotes: "Holat bo'yicha izoh",
      confidence: "Ishonch",
      rawNotes: "Qo'shimcha izoh",
    },
  } as const;
}

export function getDocumentTypeLabel(docType: string, language: PdfLanguage) {
  const labels: Record<string, Record<PdfLanguage, string>> = {
    passport: { ru: "Паспорт", uz: "Pasport" },
    vehicle_doc: { ru: "Документ на авто", uz: "Avtomobil hujjati" },
    certificate: { ru: "Справка или свидетельство", uz: "Ma'lumotnoma yoki guvohnoma" },
    other: { ru: "Другой документ", uz: "Boshqa hujjat" },
  };
  return labels[docType]?.[language] ?? labels.other[language];
}

export function getDocumentTypeFilePart(docType: string, language: PdfLanguage) {
  const labels: Record<string, Record<PdfLanguage, string>> = {
    passport: { ru: "pasport", uz: "pasport" },
    vehicle_doc: { ru: "avto", uz: "avto" },
    certificate: { ru: "spravka", uz: "guvohnoma" },
    other: { ru: "drugoy", uz: "boshqa" },
  };
  return labels[docType]?.[language] ?? labels.other[language];
}

export function getExtractedFieldLabel(key: string, language: PdfLanguage, index: number) {
  const labels: Record<string, Record<PdfLanguage, string>> = {
    fullName: { ru: "ФИО", uz: "F.I.Sh." },
    passportNumber: { ru: "Номер паспорта", uz: "Pasport raqami" },
    dateOfBirth: { ru: "Дата рождения", uz: "Tug'ilgan sana" },
    phone: { ru: "Телефон", uz: "Telefon" },
    address: { ru: "Адрес", uz: "Manzil" },
    vin: { ru: "VIN", uz: "VIN" },
    plateNumber: { ru: "Гос. номер", uz: "Davlat raqami" },
    inn: { ru: "ИНН", uz: "STIR" },
    make: { ru: "Марка", uz: "Marka" },
    model: { ru: "Модель", uz: "Model" },
    vehicleType: { ru: "Тип авто", uz: "Avto turi" },
    color: { ru: "Цвет", uz: "Rang" },
    plateText: { ru: "Гос. номер", uz: "Davlat raqami" },
    approximateYear: { ru: "Примерный год", uz: "Taxminiy yil" },
    visibleConditionNotes: { ru: "Заметки о состоянии", uz: "Holat bo'yicha izoh" },
    confidence: { ru: "Уверенность", uz: "Ishonch" },
    rawNotes: { ru: "Доп. заметки", uz: "Qo'shimcha izoh" },
  };
  return labels[key]?.[language] ?? (language === "ru" ? `Поле ${index + 1}` : `${index + 1}-maydon`);
}

export async function buildPdfPayload(
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

  const answers = await getClientPreferenceAnswers(clientId);
  const profile = buildClientPreferenceProfile(answers, language);
  const preferenceSummary = summarizeClientPreferences(profile, language);

  // Localization via LLM is permanently removed — the AI service was
  // decommissioned in Phase B4. The PDF renderer falls back to the raw
  // product fields via getDisplayValueForLanguage when localized ones are
  // missing, so leaving these null is safe.
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

  // Most recent collateral estimate (with item snapshots and type names) so
  // the offer PDF can include a collateral summary section. Optional —
  // returns null when the client has never had a collateral estimate.
  const [latestEstimate] = await db
    .select()
    .from(collateralEstimatesTable)
    .where(eq(collateralEstimatesTable.clientId, clientId))
    .orderBy(desc(collateralEstimatesTable.createdAt))
    .limit(1);

  let collateralEstimate: {
    requestedLoanAmount: string;
    totalAcceptedValue: string;
    coveragePercent: string;
    maxLoanAmount: string;
    resultStatus: "enough" | "not_enough";
    items: Array<{ title: string; typeName: string; marketValue: string; acceptedValue: string }>;
    currency: string;
  } | null = null;

  if (latestEstimate) {
    const estimateItems = await db
      .select({
        title: collateralItemsTable.title,
        typeNameRu: collateralTypesTable.nameRu,
        typeNameUz: collateralTypesTable.nameUz,
        marketValueSnapshot: collateralEstimateItemsTable.marketValueSnapshot,
        acceptedValueSnapshot: collateralEstimateItemsTable.acceptedValueSnapshot,
      })
      .from(collateralEstimateItemsTable)
      .innerJoin(
        collateralItemsTable,
        eq(collateralEstimateItemsTable.collateralItemId, collateralItemsTable.id),
      )
      .innerJoin(
        collateralTypesTable,
        eq(collateralItemsTable.collateralTypeId, collateralTypesTable.id),
      )
      .where(eq(collateralEstimateItemsTable.estimateId, latestEstimate.id));

    collateralEstimate = {
      requestedLoanAmount: latestEstimate.requestedLoanAmount,
      totalAcceptedValue: latestEstimate.totalAcceptedValue,
      coveragePercent: latestEstimate.coveragePercent,
      maxLoanAmount: latestEstimate.maxLoanAmount,
      resultStatus: latestEstimate.resultStatus as "enough" | "not_enough",
      currency: latestEstimate.currency,
      items: estimateItems.map((it) => ({
        title: it.title,
        typeName: language === "ru" ? it.typeNameRu : (it.typeNameUz ?? it.typeNameRu),
        marketValue: it.marketValueSnapshot,
        acceptedValue: it.acceptedValueSnapshot,
      })),
    };
  }

  return {
    client,
    basketItems: localizedBasketItems,
    calculations,
    preferenceSummary,
    expertName: expert?.name || "-",
    expertTelegramId: expert?.telegramId || null,
    branchName: branch?.name || "-",
    language,
    collateralEstimate,
  };
}
