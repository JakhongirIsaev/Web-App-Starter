import { describe, expect, it } from "vitest";
import XLSX from "xlsx";
import {
  parseCreditLinesWorkbook,
  parseCreditProductsWorkbook,
  parseSapCodesWorkbook,
} from "../lib/spreadsheet-import";

function buildWorkbookBuffer(sheets: unknown[][][]): Buffer {
  const workbook = XLSX.utils.book_new();

  sheets.forEach((rows, index) => {
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, `Sheet${index + 1}`);
  });

  return Buffer.from(XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }));
}

function makePaddedRows(totalRows: number): unknown[][] {
  return Array.from({ length: totalRows }, (_, index) => [`pad-${index + 1}`]);
}

describe("parseCreditProductsWorkbook", () => {
  it("inherits grouped product fields across segment rows", () => {
    const creditProductRows = makePaddedRows(8);
    creditProductRows[6] = [
      null,
      1,
      "Express SME Loan",
      "SAP-100",
      "Medium",
      "Transfer",
      "Up to 1B",
      "12",
      "24",
      "6",
      0.24,
      0.1,
      null,
      "3",
      "Working capital",
      "Priority product",
    ];
    creditProductRows[7] = [
      null,
      null,
      null,
      null,
      "Micro",
      null,
      "Up to 300M",
      null,
      null,
      null,
      0.28,
      null,
      null,
      null,
      null,
      "Micro segment focus",
    ];

    const workbook = buildWorkbookBuffer([creditProductRows, [[]], [[]]]);
    const parsed = parseCreditProductsWorkbook(workbook);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      number: 1,
      name: "Express SME Loan",
      sapCode: "SAP-100",
      segment: "Medium",
      loanAmount: "Up to 1B",
      rateUZS: "24%",
      highlight: "Priority product",
    });
    expect(parsed[1]).toMatchObject({
      number: 1,
      name: "Express SME Loan",
      sapCode: "SAP-100",
      segment: "Micro",
      loanAmount: "Up to 300M",
      rateUZS: "28%",
      highlight: "Micro segment focus",
    });
  });
});

describe("parseSapCodesWorkbook", () => {
  it("reads the SAP mapping sheet", () => {
    const sapRows: unknown[][] = [
      ["status", "productId", "name", "productType", "categoryId", "categoryName"],
      ["Active", "P-01", "Express SME Loan", "Loan", "CAT-01", "SME"],
      [null, null, null, null, null, null],
    ];

    const workbook = buildWorkbookBuffer([[[]], sapRows, [[]]]);
    const parsed = parseSapCodesWorkbook(workbook);

    expect(parsed).toEqual([
      {
        status: "Active",
        productId: "P-01",
        name: "Express SME Loan",
        productType: "Loan",
        categoryId: "CAT-01",
        categoryName: "SME",
      },
    ]);
  });
});

describe("parseCreditLinesWorkbook", () => {
  it("captures sections, currency mapping, and calculated balances", () => {
    const creditLineRows = makePaddedRows(8);
    creditLineRows[6] = ["Available for drawdown"];
    creditLineRows[7] = [
      7,
      "KfW Working Capital",
      "International",
      "2026-04-01",
      1000000,
      800000,
      "000",
      0.225,
      300000,
      null,
      4,
      "Collateral required",
      "Priority line",
    ];

    const workbook = buildWorkbookBuffer([[[]], [[]], creditLineRows]);
    const parsed = parseCreditLinesWorkbook(workbook);

    expect(parsed).toEqual([
      {
        number: 7,
        name: "KfW Working Capital",
        department: "International",
        agreementDate: "2026-04-01",
        agreementAmount: "1000000",
        receivedAmount: "800000",
        currency: "UZS",
        interestRate: "22.5%",
        disbursedAmount: "300000",
        remainingBalance: "500000",
        projectCount: 4,
        specialConditions: "Collateral required",
        notes: "Priority line",
        section: "Available for drawdown",
      },
    ]);
  });
});
