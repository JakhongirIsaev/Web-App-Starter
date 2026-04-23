import * as XLSX from "xlsx";

export interface UploadLike {
  originalname?: string;
  mimetype?: string;
}

export interface CreditProductImportRow {
  number: number | null;
  name: string;
  sapCode: string | null;
  segment: string | null;
  disbursementForm: string | null;
  loanAmount: string | null;
  termWorkingCapital: string | null;
  termFixedAssets: string | null;
  termUntargeted: string | null;
  rateUZS: string | null;
  rateUSD: string | null;
  rateEUR: string | null;
  gracePeriod: string | null;
  purpose: string | null;
  highlight: string | null;
}

export interface SapCodeImportRow {
  status: string;
  productId: string | null;
  name: string;
  productType: string | null;
  categoryId: string | null;
  categoryName: string | null;
}

export interface CreditLineImportRow {
  number: number | null;
  name: string;
  department: string | null;
  agreementDate: string | null;
  agreementAmount: string | null;
  receivedAmount: string | null;
  currency: string | null;
  interestRate: string | null;
  disbursedAmount: string | null;
  remainingBalance: string | null;
  projectCount: number | null;
  specialConditions: string | null;
  notes: string | null;
  section: string | null;
}

const EXCEL_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
]);

export function isExcelUpload(file?: UploadLike | null): boolean {
  if (!file) return false;

  const fileName = (file.originalname || "").toLowerCase();
  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) return true;

  return EXCEL_MIME_TYPES.has((file.mimetype || "").toLowerCase());
}

function readWorkbook(buffer: Buffer) {
  return XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
  });
}

function getSheetRows(buffer: Buffer, sheetIndex: number): unknown[][] {
  const workbook = readWorkbook(buffer);
  const sheetName = workbook.SheetNames[sheetIndex];

  if (!sheetName) {
    throw new Error(`Workbook does not contain sheet #${sheetIndex + 1}`);
  }

  const sheet = workbook.Sheets[sheetName];

  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  }) as unknown[][];
}

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const text = String(value)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  return text ? text : null;
}

function normalizeNumericString(value: number): string {
  return value
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");
}

function parseLooseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = normalizeText(value);
  if (!text) return null;

  const normalized = text
    .replace(/%/g, "")
    .replace(/\u00A0/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: unknown): number | null {
  const parsed = parseLooseNumber(value);
  if (parsed === null) return null;
  return Math.trunc(parsed);
}

function parseDateString(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return normalizeText(value);
}

function parseRateString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const percentValue = Math.abs(value) < 1 ? value * 100 : value;
    return `${normalizeNumericString(percentValue)}%`;
  }

  return normalizeText(value);
}

function parseMoneyString(value: unknown): string | null {
  const parsed = parseLooseNumber(value);
  if (parsed === null) return null;
  return normalizeNumericString(parsed);
}

function parseCurrencyCode(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;

  const digits = text.replace(/\D/g, "");
  const lookup = digits || text.toUpperCase();

  switch (lookup) {
    case "840":
    case "USD":
      return "USD";
    case "978":
    case "EUR":
      return "EUR";
    case "392":
    case "JPY":
      return "JPY";
    case "000":
    case "860":
    case "UZS":
      return "UZS";
    default:
      return text.toUpperCase();
  }
}

type CreditProductBase = Omit<CreditProductImportRow, "segment">;

export function parseCreditProductsWorkbook(buffer: Buffer): CreditProductImportRow[] {
  const rows = getSheetRows(buffer, 0);
  const parsed: CreditProductImportRow[] = [];
  let currentBase: CreditProductBase | null = null;

  for (let index = 6; index < rows.length; index++) {
    const row = rows[index] ?? [];

    const extracted: CreditProductImportRow = {
      number: parseInteger(row[1]),
      name: normalizeText(row[2]) || "",
      sapCode: normalizeText(row[3]),
      segment: normalizeText(row[4]),
      disbursementForm: normalizeText(row[5]),
      loanAmount: normalizeText(row[6]),
      termWorkingCapital: normalizeText(row[7]),
      termFixedAssets: normalizeText(row[8]),
      termUntargeted: normalizeText(row[9]),
      rateUZS: parseRateString(row[10]),
      rateUSD: parseRateString(row[11]),
      rateEUR: parseRateString(row[12]),
      gracePeriod: normalizeText(row[13]),
      purpose: normalizeText(row[14]),
      highlight: normalizeText(row[15]),
    };

    const startsNewProduct =
      extracted.number !== null ||
      Boolean(extracted.name) ||
      Boolean(extracted.sapCode);

    if (startsNewProduct) {
      currentBase = {
        number: extracted.number,
        name: extracted.name,
        sapCode: extracted.sapCode,
        disbursementForm: extracted.disbursementForm,
        loanAmount: extracted.loanAmount,
        termWorkingCapital: extracted.termWorkingCapital,
        termFixedAssets: extracted.termFixedAssets,
        termUntargeted: extracted.termUntargeted,
        rateUZS: extracted.rateUZS,
        rateUSD: extracted.rateUSD,
        rateEUR: extracted.rateEUR,
        gracePeriod: extracted.gracePeriod,
        purpose: extracted.purpose,
        highlight: extracted.highlight,
      };
    }

    if (!currentBase || !extracted.segment) {
      continue;
    }

    const merged: CreditProductImportRow = {
      number: extracted.number ?? currentBase.number ?? null,
      name: extracted.name || currentBase.name,
      sapCode: extracted.sapCode ?? currentBase.sapCode ?? null,
      segment: extracted.segment,
      disbursementForm: extracted.disbursementForm ?? currentBase.disbursementForm ?? null,
      loanAmount: extracted.loanAmount ?? currentBase.loanAmount ?? null,
      termWorkingCapital: extracted.termWorkingCapital ?? currentBase.termWorkingCapital ?? null,
      termFixedAssets: extracted.termFixedAssets ?? currentBase.termFixedAssets ?? null,
      termUntargeted: extracted.termUntargeted ?? currentBase.termUntargeted ?? null,
      rateUZS: extracted.rateUZS ?? currentBase.rateUZS ?? null,
      rateUSD: extracted.rateUSD ?? currentBase.rateUSD ?? null,
      rateEUR: extracted.rateEUR ?? currentBase.rateEUR ?? null,
      gracePeriod: extracted.gracePeriod ?? currentBase.gracePeriod ?? null,
      purpose: extracted.purpose ?? currentBase.purpose ?? null,
      highlight: extracted.highlight ?? currentBase.highlight ?? null,
    };

    if (!merged.name) continue;
    parsed.push(merged);
  }

  return parsed;
}

export function parseSapCodesWorkbook(buffer: Buffer): SapCodeImportRow[] {
  const rows = getSheetRows(buffer, 1);
  const parsed: SapCodeImportRow[] = [];

  for (let index = 1; index < rows.length; index++) {
    const row = rows[index] ?? [];

    const status = normalizeText(row[0]);
    const productId = normalizeText(row[1]);
    const name = normalizeText(row[2]);

    if (!status && !productId && !name) continue;
    if (!status || !name) continue;

    parsed.push({
      status,
      productId,
      name,
      productType: normalizeText(row[3]),
      categoryId: normalizeText(row[4]),
      categoryName: normalizeText(row[5]),
    });
  }

  return parsed;
}

export function parseCreditLinesWorkbook(buffer: Buffer): CreditLineImportRow[] {
  const rows = getSheetRows(buffer, 2);
  const parsed: CreditLineImportRow[] = [];
  let currentSection: string | null = null;

  for (let index = 6; index < rows.length; index++) {
    const row = rows[index] ?? [];

    const firstCellText = normalizeText(row[0]);
    const number = parseInteger(row[0]);
    const name = normalizeText(row[1]);

    if (number === null && firstCellText && !name) {
      currentSection = firstCellText;
      continue;
    }

    if (!name) continue;

    const receivedNumber = parseLooseNumber(row[5]);
    const disbursedNumber = parseLooseNumber(row[8]) ?? 0;

    parsed.push({
      number,
      name,
      department: normalizeText(row[2]),
      agreementDate: parseDateString(row[3]),
      agreementAmount: parseMoneyString(row[4]),
      receivedAmount: parseMoneyString(row[5]),
      currency: parseCurrencyCode(row[6]),
      interestRate: parseRateString(row[7]),
      disbursedAmount: parseMoneyString(row[8]),
      remainingBalance:
        receivedNumber !== null
          ? normalizeNumericString(receivedNumber - disbursedNumber)
          : parseMoneyString(row[9]),
      projectCount: parseInteger(row[10]),
      specialConditions: normalizeText(row[11]),
      notes: normalizeText(row[12]),
      section: currentSection,
    });
  }

  return parsed;
}

export function mapCreditProductCsvRow(row: Record<string, string>): CreditProductImportRow {
  return {
    number: parseInteger(row.number),
    name: normalizeText(row.name) || "",
    sapCode: normalizeText(row.sapCode),
    segment: normalizeText(row.segment),
    disbursementForm: normalizeText(row.disbursementForm),
    loanAmount: normalizeText(row.loanAmount),
    termWorkingCapital: normalizeText(row.termWorkingCapital),
    termFixedAssets: normalizeText(row.termFixedAssets),
    termUntargeted: normalizeText(row.termUntargeted),
    rateUZS: parseRateString(row.rateUZS),
    rateUSD: parseRateString(row.rateUSD),
    rateEUR: parseRateString(row.rateEUR),
    gracePeriod: normalizeText(row.gracePeriod),
    purpose: normalizeText(row.purpose),
    highlight: normalizeText(row.highlight),
  };
}

export function mapSapCodeCsvRow(row: Record<string, string>): SapCodeImportRow {
  return {
    status: normalizeText(row.status) || "",
    productId: normalizeText(row.productId),
    name: normalizeText(row.name) || "",
    productType: normalizeText(row.productType),
    categoryId: normalizeText(row.categoryId),
    categoryName: normalizeText(row.categoryName),
  };
}

export function mapCreditLineCsvRow(row: Record<string, string>): CreditLineImportRow {
  const receivedNumber = parseLooseNumber(row.receivedAmount);
  const disbursedNumber = parseLooseNumber(row.disbursedAmount) ?? 0;

  return {
    number: parseInteger(row.number),
    name: normalizeText(row.name) || "",
    department: normalizeText(row.department),
    agreementDate: parseDateString(row.agreementDate),
    agreementAmount: parseMoneyString(row.agreementAmount),
    receivedAmount: parseMoneyString(row.receivedAmount),
    currency: parseCurrencyCode(row.currency),
    interestRate: parseRateString(row.interestRate),
    disbursedAmount: parseMoneyString(row.disbursedAmount),
    remainingBalance:
      receivedNumber !== null
        ? normalizeNumericString(receivedNumber - disbursedNumber)
        : parseMoneyString(row.remainingBalance),
    projectCount: parseInteger(row.projectCount),
    specialConditions: normalizeText(row.specialConditions),
    notes: normalizeText(row.notes),
    section: normalizeText(row.section),
  };
}
