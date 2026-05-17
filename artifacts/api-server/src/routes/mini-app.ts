import { Router, type IRouter } from "express";
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
import { matchKnowledgeDocs } from "../lib/knowledge-match";
import { enqueueEspoSync } from "../lib/espo-enqueue";
import { eq, and, asc, desc, count, gte, lte, or, inArray } from "drizzle-orm";
import { guestAuth } from "../middleware/auth";
import { generateClientPdf } from "../pdf/generate";
import { generateLeaveBehindPdf, type LeaveBehindInput } from "../pdf/leave-behind";
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
import { buildCalculationSummary, buildPaymentSchedule } from "../lib/calculations";
import {
  isAllowedStatusTransition,
  isApplicationFrozen,
  transitionClientStatus,
  StatusTransitionError,
} from "../lib/client-status-machine";
import { validateExtractedData } from "../lib/uz-doc-validation";
import {
  requireClientAccess,
  requireClientAccessFromBody,
  requireDocumentAccess,
  requireNextActionAccess,
  verifyClientAccess,
} from "../lib/client-access";
import { logger } from "../lib/logger";
import { getR2 } from "../storage/r2-client";
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

const router: IRouter = Router();
const adminRoles = ["superadmin", "head_office_admin"];
type PdfLanguage = "ru" | "uz";

const INVALID_BODY_ERROR = "Некорректные данные / Noto'g'ri ma'lumot";

async function persistGeneratedClientDocument({
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
  return "Nokredit mahsulot";
}

function extractScaledNumbers(value?: string | number | null) {
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

function parseAmountValue(value?: string | number | null) {
  const [first] = extractScaledNumbers(value);
  return typeof first === "number" && Number.isFinite(first) ? first : null;
}

function resolveRequestedAmount(
  item: {
    loanAmount?: string | null;
  },
  profile: ReturnType<typeof buildClientPreferenceProfile>,
) {
  const requestedAmount = parseAmountValue(profile.desiredAmount);
  if (requestedAmount) return requestedAmount;
  return parseAmountValue(item.loanAmount ?? null);
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

// Phase B3a: the legacy questionnaire_* tables were renamed to archived_* and
// no longer participate in the live funnel. The fixed lead-form on /new-client
// writes its answers directly onto clientsTable, so we synthesize the
// preference-answer array from the client row to keep buildClientPreferenceProfile
// (and the downstream PDF / recommendation pipeline) working unchanged.
async function getClientPreferenceAnswers(clientId: number): Promise<QuestionnaireAnswer[]> {
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

function resolvePdfLanguage(value: unknown): PdfLanguage {
  return value === "ru" ? "ru" : "uz";
}

// Phase D2: PDF endpoints prefer the client's saved preferredLanguage when no
// explicit language is in the request. Defaults to "ru" when neither side has
// expressed a preference (matches the leave-behind PDF generator default).
function resolvePdfLanguageForClient(
  requestValue: unknown,
  clientPreferred: string | null | undefined,
): PdfLanguage {
  const candidate =
    requestValue === "ru" || requestValue === "uz"
      ? requestValue
      : clientPreferred ?? "ru";
  return candidate === "uz" ? "uz" : "ru";
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getPurposeLabel(value: string | null | undefined, language: PdfLanguage) {
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

async function buildLeaveBehindDetails(
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

function getAutoExcelCopy(language: PdfLanguage) {
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

function getDocumentTypeLabel(docType: string, language: PdfLanguage) {
  const labels: Record<string, Record<PdfLanguage, string>> = {
    passport: { ru: "Паспорт", uz: "Pasport" },
    vehicle_doc: { ru: "Документ на авто", uz: "Avtomobil hujjati" },
    certificate: { ru: "Справка или свидетельство", uz: "Ma'lumotnoma yoki guvohnoma" },
    other: { ru: "Другой документ", uz: "Boshqa hujjat" },
  };
  return labels[docType]?.[language] ?? labels.other[language];
}

function getDocumentTypeFilePart(docType: string, language: PdfLanguage) {
  const labels: Record<string, Record<PdfLanguage, string>> = {
    passport: { ru: "pasport", uz: "pasport" },
    vehicle_doc: { ru: "avto", uz: "avto" },
    certificate: { ru: "spravka", uz: "guvohnoma" },
    other: { ru: "drugoy", uz: "boshqa" },
  };
  return labels[docType]?.[language] ?? labels.other[language];
}

function getExtractedFieldLabel(key: string, language: PdfLanguage, index: number) {
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

router.get("/mini-app/clients", guestAuth, async (req, res) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const branchId = req.user!.branchId;
  const status = typeof req.query.status === "string" ? req.query.status as ClientStatus : undefined;
  const gender =
    req.query.gender === "male" || req.query.gender === "female"
      ? req.query.gender
      : undefined;
  const isAdmin = adminRoles.includes(role);

  const conditions: any[] = [];
  if (status) conditions.push(eq(clientsTable.status, status));
  if (gender) conditions.push(eq(clientsTable.gender, gender));
  // data-scope filter — not authorization
  if (role === "branch_head" && branchId) {
    conditions.push(eq(clientsTable.branchId, branchId));
  } else if (!isAdmin) {
    conditions.push(eq(clientsTable.assignedToId, userId));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const clients = await db
    .select({
      id: clientsTable.id,
      sessionId: clientsTable.sessionId,
      fullName: clientsTable.fullName,
      phone: clientsTable.phone,
      status: clientsTable.status,
      gender: clientsTable.gender,
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

router.post("/mini-app/clients", guestAuth, async (req, res) => {
  const userId = req.user!.id;
  const branchId = req.user!.branchId;

  const parsed = MiniAppCreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: INVALID_BODY_ERROR, issues: parsed.error.flatten() });
    return;
  }
  const {
    fullName,
    phone,
    telegramUsername,
    gender,
    legalName,
    leadSource,
    referrerClientId,
    selfCheckCitizenshipUz,
    selfCheckSixMonthsOperation,
    selfCheckPredominantlyPrivate,
    selfCheckBranchServiceArea,
    purpose,
    desiredAmountUzs,
    desiredTermMonths,
    preferredCurrency,
    preferredLanguage,
    externalUuid,
  } = parsed.data;
  // Normalize the optional Telegram username: strip leading "@" and treat
  // empty / whitespace as null so we don't store junk values.
  const normalizedTelegramUsername = (() => {
    if (telegramUsername === undefined || telegramUsername === null) return null;
    const trimmed = telegramUsername.trim().replace(/^@+/, "");
    return trimmed === "" ? null : trimmed;
  })();
  const sessionId = `S-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  let assignedBranchId = branchId;
  if (!assignedBranchId) {
    const [firstBranch] = await db.select().from(branchesTable).limit(1);
    if (!firstBranch) {
      res.status(400).json({ error: "Tizimda filiallar topilmadi" });
      return;
    }
    assignedBranchId = firstBranch.id;
  }

  // Phase E: any submitted client is a lead. Self-checks and the loan-intent
  // triple are no longer required at lead time — they were rudiments of the
  // old recommendation flow. Credit info is filled later on client-detail
  // (which promotes status lead → recommendation).
  const hasAnyIdentity =
    !!(fullName && fullName.trim()) ||
    !!(phone && phone.trim()) ||
    !!(legalName && legalName.trim());

  // Phase D1 followup — offline-queue idempotency. The mini-app passes an
  // externalUuid generated at first-send-attempt time. If the request is a
  // replay (server committed but the response was lost in transit), the
  // ON CONFLICT path triggers and we return the previously-inserted row
  // instead of creating a duplicate client. When externalUuid is absent
  // (legacy callers, server-side flows), defaultRandom() in the schema
  // supplies a fresh value and no conflict is possible.
  const inserted = await db
    .insert(clientsTable)
    .values({
      sessionId,
      fullName: fullName || null,
      phone: phone || null,
      telegramUsername: normalizedTelegramUsername,
      status: hasAnyIdentity ? "lead" : "draft",
      branchId: assignedBranchId,
      assignedToId: userId,
      gender: gender ?? null,
      legalName: legalName?.trim() || null,
      leadSource: leadSource ?? null,
      // Only persist the referrer when the lead source actually warrants it.
      // This prevents stray IDs from hanging off non-referral leads.
      referrerClientId:
        leadSource === "referral_existing_client" && referrerClientId
          ? referrerClientId
          : null,
      selfCheckCitizenshipUz: selfCheckCitizenshipUz ?? null,
      selfCheckSixMonthsOperation: selfCheckSixMonthsOperation ?? null,
      selfCheckPredominantlyPrivate: selfCheckPredominantlyPrivate ?? null,
      selfCheckBranchServiceArea: selfCheckBranchServiceArea ?? null,
      purpose: purpose ?? null,
      desiredAmountUzs: desiredAmountUzs !== undefined && desiredAmountUzs !== null
        ? String(desiredAmountUzs)
        : null,
      desiredTermMonths: desiredTermMonths ?? null,
      preferredCurrency: preferredCurrency ?? null,
      preferredLanguage: preferredLanguage ?? null,
      ...(externalUuid ? { externalUuid } : {}),
    })
    .onConflictDoNothing({ target: clientsTable.externalUuid })
    .returning();

  let client;
  let isReplay = false;
  if (inserted.length > 0) {
    client = inserted[0];
  } else {
    // Conflict path: a row with this externalUuid already exists, which only
    // happens when the client supplied an externalUuid we've already seen
    // (i.e. an offline-queue replay of a previously-committed save).
    if (!externalUuid) {
      // Without an explicit externalUuid the DB default would have produced a
      // fresh UUID and no conflict was possible — reaching here would be a
      // genuine bug, not a replay.
      res.status(500).json({ error: "insert_failed_unexpectedly" });
      return;
    }
    const [existing] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.externalUuid, externalUuid))
      .limit(1);
    if (!existing) {
      res.status(500).json({ error: "insert_returned_no_rows_no_existing" });
      return;
    }
    client = existing;
    isReplay = true;
  }

  // Fire-and-forget Espo sync. Helper swallows errors so a queue hiccup
  // can't fail the user-facing client save. On replay we skip the enqueue:
  // the original insert already enqueued an espo job for this externalUuid,
  // and the espo_sync_jobs unique idempotency_key + graphile-worker jobKey
  // would also dedupe — but skipping avoids a noisy "insert failed" log.
  if (!isReplay) {
    await enqueueEspoSync({ clientId: client.id, externalUuid: client.externalUuid });
  }

  res.json(client);
});

router.get("/mini-app/clients/export-all", guestAuth, async (req, res) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const branchId = req.user!.branchId;

  // data-scope filter — not authorization
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
            text += `: ${entries.map(([k, v], index) => `${getExtractedFieldLabel(k, "uz", index)}=${v}`).join(", ")}`;
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
  res.setHeader("Content-Disposition", `attachment; filename="mijozlar_${dateStr}.txt"; filename*=UTF-8''${encodeURIComponent(`mijozlar_eksport_${dateStr}.txt`)}`);
  res.send(text);
});

router.get("/mini-app/clients/:id", guestAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (!client) {
    res.status(404).json({ error: "Mijoz topilmadi" });
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

  res.json({
    client,
    notes,
    nextActions,
    basket: basket[0] || null,
    basketItems,
    calculations,
  });
});

router.put("/mini-app/clients/:id", guestAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const parsed = MiniAppUpdateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: INVALID_BODY_ERROR, issues: parsed.error.flatten() });
    return;
  }
  const {
    fullName,
    phone,
    telegramUsername,
    legalName,
    status,
    latitude,
    longitude,
    gender,
    clientType,
    clientSegment,
    purpose,
    desiredAmountUzs,
    desiredTermMonths,
    preferredCurrency,
  } = parsed.data;

  // Snapshot current state for transition + frozen-fields validation
  const [currentClient] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);
  if (!currentClient) {
    res.status(404).json({ error: "Mijoz topilmadi / Клиент не найден" });
    return;
  }

  // Status transition guard
  if (status !== undefined && status !== currentClient.status) {
    if (!isAllowedStatusTransition(currentClient.status as ClientStatus, status as ClientStatus)) {
      res.status(400).json({
        error: `Holatni o'zgartirish ruxsat etilmagan / Переход статуса не разрешён: ${currentClient.status} → ${status}`,
      });
      return;
    }
  }

  // Freeze credit-application fields once a PDF was already generated.
  // Re-quoting after the offer has been sent should require an explicit
  // status rollback first (which itself goes through the transition graph).
  if (isApplicationFrozen(currentClient.status as ClientStatus)) {
    const triesEditApplication =
      purpose !== undefined ||
      desiredAmountUzs !== undefined ||
      desiredTermMonths !== undefined ||
      preferredCurrency !== undefined;
    if (triesEditApplication) {
      res.status(409).json({
        error:
          "Taklif allaqachon yuborilgan, kredit arizasini o'zgartirib bo'lmaydi / Заявка зафиксирована, изменение полей кредитной заявки запрещено",
      });
      return;
    }
  }

  const updates: any = { updatedAt: new Date() };
  if (fullName !== undefined) updates.fullName = fullName;
  if (phone !== undefined) updates.phone = phone;
  if (telegramUsername !== undefined) {
    const trimmed = telegramUsername.trim().replace(/^@+/, "");
    updates.telegramUsername = trimmed === "" ? null : trimmed;
  }
  if (legalName !== undefined) {
    const trimmed = legalName.trim();
    updates.legalName = trimmed === "" ? null : trimmed;
  }
  if (status !== undefined) updates.status = status;
  if (latitude !== undefined) updates.latitude = latitude.toString();
  if (longitude !== undefined) updates.longitude = longitude.toString();
  if (gender !== undefined) updates.gender = gender;
  if (clientType !== undefined) updates.clientType = clientType;
  if (clientSegment !== undefined) updates.clientSegment = clientSegment;
  if (purpose !== undefined) updates.purpose = purpose || null;
  if (desiredAmountUzs !== undefined) {
    updates.desiredAmountUzs =
      desiredAmountUzs !== null ? String(desiredAmountUzs) : null;
  }
  if (desiredTermMonths !== undefined) {
    updates.desiredTermMonths = desiredTermMonths ?? null;
  }
  if (preferredCurrency !== undefined) updates.preferredCurrency = preferredCurrency || null;

  // Phase E — auto-promote status from lead/draft → recommendation when all
  // four credit-application fields are populated. Status is the repurposed
  // "credit info ready, needs product picked" stage. Idempotent: if the
  // client is already past `recommendation` we don't downgrade.
  if (
    purpose !== undefined ||
    desiredAmountUzs !== undefined ||
    desiredTermMonths !== undefined ||
    preferredCurrency !== undefined
  ) {
    const nextPurpose = purpose !== undefined ? (purpose || null) : currentClient.purpose;
    const nextAmount =
      desiredAmountUzs !== undefined
        ? (desiredAmountUzs !== null ? String(desiredAmountUzs) : null)
        : currentClient.desiredAmountUzs;
    const nextTerm =
      desiredTermMonths !== undefined ? (desiredTermMonths ?? null) : currentClient.desiredTermMonths;
    const nextCurrency =
      preferredCurrency !== undefined
        ? (preferredCurrency || null)
        : currentClient.preferredCurrency;
    const allCreditFieldsSet =
      !!nextPurpose && !!nextAmount && !!nextTerm && !!nextCurrency;
    if (
      allCreditFieldsSet &&
      (currentClient.status === "draft" || currentClient.status === "lead") &&
      status === undefined
    ) {
      updates.status = "recommendation";
    }
  }

  const [updated] = await db
    .update(clientsTable)
    .set(updates)
    .where(eq(clientsTable.id, clientId))
    .returning();

  res.json(updated);
});

router.post("/mini-app/clients/:id/notes", guestAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const parsed = MiniAppNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: INVALID_BODY_ERROR, issues: parsed.error.flatten() });
    return;
  }
  const { type, content } = parsed.data;

  const [note] = await db
    .insert(clientNotesTable)
    .values({ clientId, userId: req.user!.id, type: type || "note", content })
    .returning();

  res.json(note);
});

router.post("/mini-app/clients/:id/next-action", guestAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const parsed = MiniAppNextActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: INVALID_BODY_ERROR, issues: parsed.error.flatten() });
    return;
  }
  const { actionType, actionDate, priority, description } = parsed.data;
  const parsedActionDate = new Date(actionDate);
  if (Number.isNaN(parsedActionDate.getTime())) {
    res.status(400).json({ error: INVALID_BODY_ERROR });
    return;
  }

  const [action] = await db
    .insert(clientNextActionsTable)
    .values({
      clientId,
      userId: req.user!.id,
      actionType,
      actionDate: parsedActionDate,
      priority: priority || "medium",
      description,
    })
    .returning();

  res.json(action);
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

router.post("/mini-app/recommend", guestAuth, requireClientAccessFromBody("clientId"), async (req, res) => {
  const parsed = MiniAppRecommendBody.safeParse(req.body);
  if (!parsed.success) {
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
    res.status(400).json({ error: INVALID_BODY_ERROR });
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
    res.status(400).json({ error: INVALID_BODY_ERROR });
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

router.get("/mini-app/branch-summary", guestAuth, async (req, res) => {
  const branchId = req.user!.branchId;
  if (!branchId || req.user!.role !== "branch_head") {
    res.status(403).json({ error: "Faqat filial rahbari uchun" });
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

router.post("/mini-app/clients/:id/documents", guestAuth, async (req, res) => {
  const clientId = Number(req.params.id);
  if (!(await verifyClientAccess(clientId, req.user!))) {
    res.status(403).json({ error: "Ruxsat yo'q" });
    return;
  }
  const parsed = MiniAppDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные данные / Noto'g'ri ma'lumot", issues: parsed.error.flatten() });
    return;
  }
  const { docType, fileName, storagePath, ocrText, extractedData } = parsed.data;
  // Format-validate the OCR-extracted fields (STIR, passport, phone) so the
  // UI can flag suspicious values for human review without dropping the raw
  // OCR output. The sanitized blob preserves originals when invalid.
  const validation = validateExtractedData(extractedData ?? null);
  const finalExtractedData = extractedData
    ? { ...validation.sanitized, _invalidFields: validation.invalidFields }
    : null;
  const [doc] = await db.insert(clientDocumentsTable).values({
    clientId,
    userId: req.user!.id,
    docType: docType || "other",
    fileName,
    storagePath,
    ocrText: ocrText ?? null,
    extractedData: finalExtractedData,
  }).returning();
  res.status(201).json(doc);
});

router.get("/mini-app/clients/:id/documents", guestAuth, async (req, res) => {
  const clientId = Number(req.params.id);
  if (!(await verifyClientAccess(clientId, req.user!))) {
    res.status(403).json({ error: "Ruxsat yo'q" });
    return;
  }
  const docs = await db
    .select()
    .from(clientDocumentsTable)
    .where(eq(clientDocumentsTable.clientId, clientId))
    .orderBy(desc(clientDocumentsTable.createdAt));
  res.json(docs);
});

router.put("/mini-app/documents/:id/ocr", guestAuth, requireDocumentAccess, async (req, res) => {
  const docId = Number(req.params.id);
  const parsed = MiniAppOcrUpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные данные / Noto'g'ri ma'lumot", issues: parsed.error.flatten() });
    return;
  }
  const { ocrText, extractedData } = parsed.data;
  const validation = validateExtractedData(extractedData ?? null);
  const finalExtractedData = extractedData
    ? { ...validation.sanitized, _invalidFields: validation.invalidFields }
    : null;
  const [updated] = await db
    .update(clientDocumentsTable)
    .set({
      ocrText: ocrText ?? null,
      extractedData: finalExtractedData,
    })
    .where(eq(clientDocumentsTable.id, docId))
    .returning();
  if (!updated) { res.status(404).json({ error: "Hujjat topilmadi" }); return; }
  res.json(updated);
});

router.delete("/mini-app/documents/:id", guestAuth, requireDocumentAccess, async (req, res) => {
  const docId = Number(req.params.id);
  const [deleted] = await db
    .delete(clientDocumentsTable)
    .where(eq(clientDocumentsTable.id, docId))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Hujjat topilmadi" }); return; }
  res.json({ success: true });
});

router.post("/mini-app/clients/:id/generate-pdf", guestAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const user = req.user!;
  const parsed = MiniAppGeneratePdfBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: INVALID_BODY_ERROR, issues: parsed.error.flatten() });
    return;
  }
  const sendViaTelegram = parsed.data.sendViaTelegram !== false;
  const telegramInitData =
    typeof parsed.data.telegramInitData === "string"
      ? parsed.data.telegramInitData.trim()
      : "";

  // Look up client to resolve expert (assignedTo) and branch.
  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);
  if (!client) {
    // Use a request-only language hint for the 404 since we have no client row.
    const fallbackLang = resolvePdfLanguage(parsed.data.language);
    res.status(404).json({ error: fallbackLang === "ru" ? "Клиент не найден" : "Mijoz topilmadi" });
    return;
  }
  // Phase D2: prefer the client's saved preferredLanguage when no explicit
  // language is in the request body.
  const language = resolvePdfLanguageForClient(parsed.data.language, client.preferredLanguage);

  // Resolve credit expert: prefer the assigned user; fall back to the
  // authenticated caller (mini-app users typically ARE the assigned expert).
  // The leave-behind PDF requires a phone number — fail with a 400 if neither
  // the assigned expert nor the caller has one on file.
  const expertUserId = client.assignedToId ?? user.id;
  const [expertRow] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      phone: usersTable.phone,
      telegramId: usersTable.telegramId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, expertUserId))
    .limit(1);

  if (!expertRow?.name || !expertRow?.phone) {
    res.status(400).json({
      error: "expert_missing_contact",
      message:
        language === "ru"
          ? "У назначенного эксперта не указан телефон. Заполните телефон в профиле."
          : "Tayinlangan ekspertning telefoni ko'rsatilmagan. Profilda telefonni to'ldiring.",
    });
    return;
  }

  // Resolve branch name (display only — falls back to a sensible default).
  let branchName = "IPAK YO'LI";
  if (client.branchId) {
    const [branch] = await db
      .select({ name: branchesTable.name })
      .from(branchesTable)
      .where(eq(branchesTable.id, client.branchId))
      .limit(1);
    if (branch?.name) branchName = branch.name;
  }

  const leaveBehindDetails = await buildLeaveBehindDetails(clientId, client, language);

  // Refuse to mint a PDF that would be useless to the lead. Require at least
  // one of: client identity (fullName / legalName), a populated offer block,
  // or collateral data. Without any of those the document is just header +
  // disclaimer and embarrasses the expert when handed over.
  const hasIdentity = !!(client.fullName?.trim() || client.legalName?.trim());
  const hasOfferContent = leaveBehindDetails.offer !== null;
  const hasCollateralContent = leaveBehindDetails.collateral !== null;
  if (!hasIdentity && !hasOfferContent && !hasCollateralContent) {
    res.status(400).json({
      error: "insufficient_data",
      message: language === "ru"
        ? "Недостаточно данных для PDF: заполните ФИО, заявку или залог."
        : "PDF uchun yetarli ma'lumot yo'q: F.I.Sh, ariza yoki garovni to'ldiring.",
    });
    return;
  }

  try {
    const pdfBuffer = await generateLeaveBehindPdf({
      client: {
        fullName: client.fullName,
        // No businessName column on clients yet — leave null until the schema
        // gains one (the generator already handles the missing case).
        businessName: null,
      },
      expert: { name: expertRow.name, phone: expertRow.phone },
      ...leaveBehindDetails,
      branchName,
      language,
    });

    const filenamePrefix = language === "ru" ? "predlozhenie" : "taklif";
    const fallbackName = language === "ru" ? "klient" : "mijoz";
    const filename = `${filenamePrefix}_${(client.fullName || fallbackName).replace(/\s+/g, "_")}_${formatFileDate()}.pdf`;

    await persistGeneratedClientDocument({
      clientId,
      userId: user.id,
      buffer: pdfBuffer,
      fileName: filename,
      docType: "generated_pdf",
      mimeType: "application/pdf",
    });

    let telegramSent = false;
    let targetTelegramId = expertRow.telegramId || null;

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
      const caption = language === "ru"
        ? `Коммерческое предложение: ${client.fullName || "Клиент"}\nЭксперт: ${expertRow.name}`
        : `Tijorat taklifi: ${client.fullName || "Mijoz"}\nEkspert: ${expertRow.name}`;
      telegramSent = await sendDocument(targetTelegramId, pdfBuffer, filename, caption);
    }

    // Route the status change through the state machine so PDF generation
    // can't silently push the client past `recommendation`/`basket` from a
    // disallowed source state. If the client somehow sits at e.g. `approved`,
    // the transition is rejected and we surface a clean 409 instead of a
    // silent overwrite.
    try {
      await transitionClientStatus(clientId, "pdf_generated");
    } catch (err) {
      if (err instanceof StatusTransitionError) {
        res.status(409).json({
          error: language === "ru"
            ? `Переход статуса не разрешён: ${err.from} → ${err.to}`
            : `Holat o'zgarishi ruxsat etilmagan: ${err.from} → ${err.to}`,
        });
        return;
      }
      throw err;
    }

    res.json({
      success: true,
      telegramSent,
      sentToTelegramId: telegramSent ? targetTelegramId : null,
      pdfSize: pdfBuffer.length,
    });
  } catch (err: any) {
    logger.error({ err }, "PDF generation error");
    res.status(500).json({ error: language === "ru" ? "Не удалось сформировать файл" : "Faylni shakllantirib bo'lmadi" });
  }
});

// Phase C4: one-tap "send leave-behind PDF directly to the lead". Tries
// Telegram delivery if the client has a telegramUsername on file, otherwise
// returns a wa.me URL the expert can hand off to WhatsApp. Success cases:
//   { delivered: "telegram", target: "@username" }
//   { delivered: "whatsapp_url", url: "https://wa.me/..." }
router.post(
  "/mini-app/clients/:id/send-pdf-to-lead",
  guestAuth,
  async (req, res) => {
    const clientId = Number(req.params.id);
    // Resolve a request-only language for early errors that fire before we
    // have the client row in hand. Once the client loads we re-resolve with
    // the client's saved preferredLanguage taking effect (Phase D2).
    const requestLanguage = resolvePdfLanguage(req.body?.language);

    if (!Number.isFinite(clientId) || clientId <= 0) {
      res.status(400).json({ error: requestLanguage === "ru" ? "Неверный ID клиента" : "Noto'g'ri mijoz ID" });
      return;
    }

    if (!(await verifyClientAccess(clientId, req.user!))) {
      res.status(403).json({ error: requestLanguage === "ru" ? "Доступ запрещён" : "Ruxsat yo'q" });
      return;
    }

    const [client] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId))
      .limit(1);
    if (!client) {
      res.status(404).json({ error: requestLanguage === "ru" ? "Клиент не найден" : "Mijoz topilmadi" });
      return;
    }
    const language = resolvePdfLanguageForClient(req.body?.language, client.preferredLanguage);

    // Resolve expert (assigned user); fall back to the caller. Phone is
    // required for the leave-behind PDF body.
    const expertUserId = client.assignedToId ?? req.user!.id;
    const [expertRow] = await db
      .select({ name: usersTable.name, phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, expertUserId))
      .limit(1);
    if (!expertRow?.name || !expertRow?.phone) {
      res.status(400).json({
        error: "expert_missing_contact",
        message:
          language === "ru"
            ? "У назначенного эксперта не указан телефон. Заполните телефон в профиле."
            : "Tayinlangan ekspertning telefoni ko'rsatilmagan. Profilda telefonni to'ldiring.",
      });
      return;
    }

    let branchName = "IPAK YO'LI";
    if (client.branchId) {
      const [b] = await db
        .select({ name: branchesTable.name })
        .from(branchesTable)
        .where(eq(branchesTable.id, client.branchId))
        .limit(1);
      if (b?.name) branchName = b.name;
    }

    const leaveBehindDetails = await buildLeaveBehindDetails(clientId, client, language);

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generateLeaveBehindPdf({
        client: { fullName: client.fullName, businessName: null },
        expert: { name: expertRow.name, phone: expertRow.phone },
        ...leaveBehindDetails,
        branchName,
        language,
      });
    } catch (err: any) {
      logger.error({ err, clientId }, "send-pdf-to-lead: PDF generation failed");
      res.status(500).json({
        error: language === "ru" ? "Не удалось сформировать файл" : "Faylni shakllantirib bo'lmadi",
      });
      return;
    }

    const fallbackName = language === "ru" ? "klient" : "mijoz";
    const filenamePrefix = language === "ru" ? "predlozhenie" : "taklif";
    const filename = `${filenamePrefix}_${(client.fullName || fallbackName).replace(/\s+/g, "_")}_${formatFileDate()}.pdf`;
    const caption =
      language === "ru"
        ? "Ваше индикативное предложение"
        : "Indikativ taklifingiz";

    await persistGeneratedClientDocument({
      clientId,
      userId: req.user!.id,
      buffer: pdfBuffer,
      fileName: filename,
      docType: "generated_pdf",
      mimeType: "application/pdf",
    });

    // Try Telegram delivery first when we have a username on file. grammy's
    // bot.api.sendDocument accepts either a numeric chat_id or a "@username"
    // string, so we forward the username as-is. If delivery fails (most
    // commonly because the user has never started a conversation with the
    // bot) we fall through to the WhatsApp URL.
    if (client.telegramUsername) {
      const username = client.telegramUsername.trim().replace(/^@+/, "");
      if (username) {
        const target = `@${username}`;
        const sent = await sendDocument(target, pdfBuffer, filename, caption);
        if (sent) {
          // Promote status so the funnel reflects that the client received the PDF.
          await db
            .update(clientsTable)
            .set({ status: "pdf_generated", updatedAt: new Date() })
            .where(eq(clientsTable.id, clientId));
          res.json({ delivered: "telegram", target });
          return;
        }
        logger.warn({ target, clientId }, "telegram delivery failed, falling back to WhatsApp URL");
      }
    }

    // Fallback: WhatsApp URL the expert opens themselves and forwards.
    if (client.phone) {
      const phoneClean = client.phone.replace(/[^0-9]/g, "");
      if (phoneClean) {
        const message =
          language === "ru"
            ? "Здравствуйте! Я отправляю Вам наше индикативное предложение."
            : "Salom! Sizga indikativ taklifimizni yuboraman.";
        const url = `https://wa.me/${phoneClean}?text=${encodeURIComponent(message)}`;
        res.json({ delivered: "whatsapp_url", url });
        return;
      }
    }

    res.status(400).json({
      error: "no_delivery_channel",
      message:
        language === "ru"
          ? "Нет ни Telegram, ни телефона у клиента"
          : "Mijozda Telegram va telefon yo'q",
    });
  },
);

router.post("/mini-app/exports/auto-excel", guestAuth, async (req, res) => {
  const parsed = MiniAppAutoExcelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные данные / Noto'g'ri ma'lumot", issues: parsed.error.flatten() });
    return;
  }
  const { clientId, docType, ocrText, imageCount, extractedData } = parsed.data;
  const language = resolvePdfLanguage(parsed.data.language);
  const copy = getAutoExcelCopy(language);
  const extracted = extractedData ?? {};
  const normalizedDocType = (docType || "other").toString();
  const documentTypeLabel = getDocumentTypeLabel(normalizedDocType, language);

  // Linkage: fetch client + assigned expert + branch so the Excel has both
  // sides of the relationship. All optional; export still works in preview mode.
  let clientRow: { id: number; fullName: string | null; phone: string | null; status: string; branchId: number; assignedToId: number | null; createdAt: Date } | null = null;
  let expertRow: { id: number; name: string; role: string; branchId: number | null } | null = null;
  let branchName: string | null = null;

  if (typeof clientId === "number") {
    if (!(await verifyClientAccess(clientId, req.user!))) {
      res.status(403).json({ error: language === "ru" ? "Доступ запрещен" : "Ruxsat yo'q" });
      return;
    }
    const [client] = await db
      .select({
        id: clientsTable.id,
        fullName: clientsTable.fullName,
        phone: clientsTable.phone,
        status: clientsTable.status,
        branchId: clientsTable.branchId,
        assignedToId: clientsTable.assignedToId,
        createdAt: clientsTable.createdAt,
      })
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId))
      .limit(1);
    if (client) {
      clientRow = client;
      if (client.assignedToId) {
        const [expert] = await db
          .select({
            id: usersTable.id,
            name: usersTable.name,
            role: usersTable.role,
            branchId: usersTable.branchId,
          })
          .from(usersTable)
          .where(eq(usersTable.id, client.assignedToId))
          .limit(1);
        if (expert) expertRow = expert;
      }
      const [branch] = await db
        .select({ name: branchesTable.name })
        .from(branchesTable)
        .where(eq(branchesTable.id, client.branchId))
        .limit(1);
      if (branch) branchName = branch.name;
    }
  }

  // Fall back to the authenticated user when no assigned expert is recorded —
  // still useful linkage (whoever triggered the export is the responsible expert).
  if (!expertRow && req.user) {
    expertRow = {
      id: req.user.id,
      name: req.user.name ?? "",
      role: req.user.role,
      branchId: req.user.branchId,
    };
  }

  const workbook = XLSX.utils.book_new();

  // Sheet 1: Summary with client ↔ expert linkage
  const summaryRows: Array<[string, string]> = [
    [copy.exportedAt, formatDateTimeInAppTimeZone(new Date())],
    [copy.documentType, documentTypeLabel],
    [copy.imageCount, String(imageCount ?? 0)],
    [],
    [copy.clientBlock, ""],
    [copy.clientId, clientRow ? String(clientRow.id) : ""],
    [copy.fullName, clientRow?.fullName ?? ""],
    [copy.phone, clientRow?.phone ?? ""],
    [copy.status, clientRow?.status ?? ""],
    [copy.createdAt, clientRow ? formatDateTimeInAppTimeZone(clientRow.createdAt) : ""],
    [copy.branch, branchName ?? ""],
    [],
    [copy.expertBlock, ""],
    [copy.expertId, expertRow ? String(expertRow.id) : ""],
    [copy.name, expertRow?.name ?? ""],
    [copy.role, expertRow?.role ?? ""],
  ] as unknown as Array<[string, string]>;
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 22 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, copy.sheetSummary);

  // Sheet 2: All extracted fields as key/value — generic for any doc type
  const fieldRows: Array<[string, string]> = [[copy.field, copy.value]];
  for (const [index, [key, value]] of Object.entries(extracted).entries()) {
    if (value === null || value === undefined) continue;
    const stringValue =
      typeof value === "object" ? JSON.stringify(value) : String(value);
    if (stringValue.trim() === "") continue;
    fieldRows.push([getExtractedFieldLabel(key, language, index), stringValue]);
  }
  const fieldsSheet = XLSX.utils.aoa_to_sheet(fieldRows);
  fieldsSheet["!cols"] = [{ wch: 24 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(workbook, fieldsSheet, copy.sheetFields);

  // Sheet 3: Vehicle-specific structured row (only when relevant or the fields
  // exist — keeps backwards compatibility for vehicle_doc flows)
  const hasVehicleFields =
    normalizedDocType === "vehicle_doc" ||
    Boolean(
      extracted.make || extracted.model || extracted.vin || extracted.plateText || extracted.plateNumber,
  );
  if (hasVehicleFields) {
    const vehicleSheet = XLSX.utils.aoa_to_sheet([
      [
        copy.clientId,
        copy.exportedAt,
        copy.imageCount,
        copy.vehicleFields.make,
        copy.vehicleFields.model,
        copy.vehicleFields.vehicleType,
        copy.vehicleFields.color,
        copy.vehicleFields.plateText,
        copy.vehicleFields.approximateYear,
        copy.vehicleFields.vin,
        copy.vehicleFields.visibleConditionNotes,
        copy.vehicleFields.confidence,
        copy.vehicleFields.rawNotes,
      ],
      [
        clientRow?.id ?? "",
        formatDateTimeInAppTimeZone(new Date()),
        imageCount ?? 0,
        String(extracted.make ?? ""),
        String(extracted.model ?? ""),
        String(extracted.vehicleType ?? ""),
        String(extracted.color ?? ""),
        String(extracted.plateText ?? extracted.plateNumber ?? ""),
        String(extracted.approximateYear ?? ""),
        String(extracted.vin ?? ""),
        String(extracted.visibleConditionNotes ?? ""),
        String(extracted.confidence ?? ""),
        String(extracted.rawNotes ?? ""),
      ],
    ]);
    XLSX.utils.book_append_sheet(workbook, vehicleSheet, copy.sheetVehicle);
  }

  // Sheet 4: Raw OCR text
  const ocrSheet = XLSX.utils.aoa_to_sheet([
    [copy.recognizedText],
    [ocrText || ""],
  ]);
  ocrSheet["!cols"] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(workbook, ocrSheet, copy.sheetOcr);

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const fileName = `${copy.filePrefix}_${getDocumentTypeFilePart(normalizedDocType, language)}_${clientRow?.id ?? copy.previewName}_${formatFileDate()}.xlsx`;

  if (clientRow && req.user) {
    await persistGeneratedClientDocument({
      clientId: clientRow.id,
      userId: req.user.id,
      buffer,
      fileName,
      docType: "generated_excel",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

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

router.get("/mini-app/clients/:id/download-pdf", guestAuth, async (req, res) => {
  const clientId = Number(req.params.id);
  // Pre-client request-language hint for the access/404 error paths. Once
  // the client loads we re-resolve, allowing client.preferredLanguage to win
  // when the request didn't pin a language explicitly (Phase D2).
  const requestLanguage = resolvePdfLanguage(req.query.language);

  if (!(await verifyClientAccess(clientId, req.user!))) {
    res.status(403).json({ error: requestLanguage === "ru" ? "Доступ запрещен" : "Ruxsat yo'q" });
    return;
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);
  if (!client) {
    res.status(404).json({ error: requestLanguage === "ru" ? "Клиент не найден" : "Mijoz topilmadi" });
    return;
  }
  const language = resolvePdfLanguageForClient(req.query.language, client.preferredLanguage);

  const expertUserId = client.assignedToId ?? req.user!.id;
  const [expertRow] = await db
    .select({ name: usersTable.name, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, expertUserId))
    .limit(1);

  if (!expertRow?.name || !expertRow?.phone) {
    res.status(400).json({
      error: "expert_missing_contact",
      message:
        language === "ru"
          ? "У назначенного эксперта не указан телефон. Заполните телефон в профиле."
          : "Tayinlangan ekspertning telefoni ko'rsatilmagan. Profilda telefonni to'ldiring.",
    });
    return;
  }

  let branchName = "IPAK YO'LI";
  if (client.branchId) {
    const [branch] = await db
      .select({ name: branchesTable.name })
      .from(branchesTable)
      .where(eq(branchesTable.id, client.branchId))
      .limit(1);
    if (branch?.name) branchName = branch.name;
  }

  const leaveBehindDetails = await buildLeaveBehindDetails(clientId, client, language);

  try {
    const pdfBuffer = await generateLeaveBehindPdf({
      client: { fullName: client.fullName, businessName: null },
      expert: { name: expertRow.name, phone: expertRow.phone },
      ...leaveBehindDetails,
      branchName,
      language,
    });

    const fileDate = formatFileDate();
    const filePrefix = language === "ru" ? "predlozhenie" : "taklif";
    const fallbackName = language === "ru" ? "klient" : "mijoz";
    const safeName = `${filePrefix}_${client.id}_${fileDate}.pdf`;
    const displayName = `${filePrefix}_${(client.fullName || fallbackName).replace(/\s+/g, "_")}_${fileDate}.pdf`;

    await persistGeneratedClientDocument({
      clientId,
      userId: req.user!.id,
      buffer: pdfBuffer,
      fileName: displayName,
      docType: "generated_pdf",
      mimeType: "application/pdf",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(displayName)}`);
    res.send(pdfBuffer);
  } catch (err: any) {
    logger.error({ err }, "PDF download error");
    res.status(500).json({ error: language === "ru" ? "Не удалось сформировать файл" : "Faylni shakllantirib bo'lmadi" });
  }
});

router.get("/mini-app/clients/:id/export", guestAuth, async (req, res) => {
  const clientId = Number(req.params.id);

  if (!(await verifyClientAccess(clientId, req.user!))) {
    res.status(403).json({ error: "Ruxsat yo'q" });
    return;
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (!client) {
    res.status(404).json({ error: "Mijoz topilmadi" });
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
      text += `\n--- ${getDocumentTypeLabel(doc.docType || "other", "uz")} (${doc.fileName}) ---\n`;
      if (doc.extractedData && typeof doc.extractedData === "object") {
        for (const [index, [k, v]] of Object.entries(doc.extractedData as Record<string, string>).entries()) {
          text += `  ${getExtractedFieldLabel(k, "uz", index)}: ${v}\n`;
        }
      }
      if (doc.ocrText) {
        text += `  Tanilgan matn: ${doc.ocrText}\n`;
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
  res.setHeader("Content-Disposition", `attachment; filename="mijoz_${clientId}.txt"; filename*=UTF-8''${encodeURIComponent(`mijoz_${clientId}_eksport.txt`)}`);
  res.send(text);
});

export default router;
