import PDFDocument from "pdfkit";
import { resolveBundledFonts } from "./generate";
import { formatUzs } from "../lib/money";

const STRINGS = {
  ru: {
    title: "Индикативное предложение",
    client: "Клиент",
    creditInterest: "Интерес клиента",
    purpose: "Цель",
    product: "Кредитный продукт",
    amount: "Запрошенная сумма",
    termRate: "Срок / ставка",
    monthlyPayment: "Ориентировочный платеж",
    noOffer: "Расчет кредита еще не сохранен. Уточните сумму, срок и продукт.",
    collateral: "Залог",
    collateralValue: "Принятая стоимость",
    collateralCoverage: "Покрытие",
    collateralMaxLoan: "Максимальный кредит",
    collateralEnough: "Залога достаточно",
    collateralNotEnough: "Нужно усилить залог",
    collateralNone: "Залог пока не рассчитан",
    expert: "Кредитный эксперт",
    callMe: "По вопросам звоните напрямую:",
    disclaimer:
      "Документ носит предварительный характер. Финальные условия определяются после проверки документов и решения кредитного комитета банка.",
  },
  uz: {
    title: "Indikativ taklif",
    client: "Mijoz",
    creditInterest: "Mijoz qiziqqan kredit",
    purpose: "Maqsad",
    product: "Kredit mahsuloti",
    amount: "So'ralgan summa",
    termRate: "Muddat / stavka",
    monthlyPayment: "Taxminiy oylik to'lov",
    noOffer: "Kredit hisobi hali saqlanmagan. Summa, muddat va mahsulotni aniqlang.",
    collateral: "Garov",
    collateralValue: "Qabul qilingan qiymat",
    collateralCoverage: "Qoplama",
    collateralMaxLoan: "Maksimal kredit",
    collateralEnough: "Garov yetarli",
    collateralNotEnough: "Garovni kuchaytirish kerak",
    collateralNone: "Garov hali hisoblanmagan",
    expert: "Kredit eksperti",
    callMe: "Savollar bo'lsa, to'g'ridan-to'g'ri qo'ng'iroq qiling:",
    disclaimer:
      "Ushbu hujjat taxminiy xarakterga ega. Yakuniy shartlar hujjatlar tekshiruvi va bank kredit qo'mitasi qaroridan keyin belgilanadi.",
  },
} as const;

export interface LeaveBehindInput {
  client: { fullName?: string | null; businessName?: string | null };
  expert: { name: string; phone: string };
  offer: {
    productName?: string | null;
    purpose?: string | null;
    amountUzs?: number | null;
    termMonths?: number | null;
    interestRate?: number | null;
    monthlyPaymentUzs?: number | null;
    currency?: string | null;
  } | null;
  collateral: {
    acceptedValueUzs?: number | null;
    coveragePercent?: number | null;
    maxLoanAmountUzs?: number | null;
    resultStatus?: "enough" | "not_enough" | null;
    items?: string[];
  } | null;
  branchName: string;
  language: "ru" | "uz";
}

const fmtMoney = (value?: number | null, currency = "UZS") => {
  if (!Number.isFinite(value ?? NaN)) return "-";
  return `${formatUzs(Math.round(value!))} ${currency}`;
};

const fmtPercent = (value?: number | null) => {
  if (!Number.isFinite(value ?? NaN)) return "-";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value!)}%`;
};

const textOrDash = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
};

export async function generateLeaveBehindPdf(
  input: LeaveBehindInput,
): Promise<Buffer> {
  const fonts = resolveBundledFonts();
  const t = STRINGS[input.language];
  const currency = input.offer?.currency || "UZS";
  const monthUnit = input.language === "ru" ? "мес" : "oy";

  const doc = new PDFDocument({
    size: "A4",
    margin: 36,
    info: {
      Title: t.title,
      Author: input.expert.name,
      Subject: `${input.client.fullName ?? ""} - ${input.branchName}`,
    },
  });

  doc.registerFont("body", fonts.body);
  doc.registerFont("bold", fonts.bold);

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done: Promise<Buffer> = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageX = 36;
  const pageW = 523;
  const green = "#16A34A";
  const dark = "#0F172A";
  const muted = "#64748B";
  const border = "#D9E7DF";

  const labelValue = (label: string, value: string, x: number, y: number, width: number) => {
    doc.font("body").fontSize(8.5).fillColor(muted).text(label, x, y, { width });
    doc.font("bold").fontSize(10.5).fillColor(dark).text(value, x, y + 13, {
      width,
      lineGap: 1,
    });
  };

  doc.rect(0, 0, 595, 96).fill("#F0FDF4");
  doc.rect(0, 92, 595, 4).fill(green);
  doc.font("bold").fontSize(21).fillColor(dark).text("IPAK YO'LI Bank", pageX, 28);
  doc.font("body").fontSize(9.5).fillColor(muted).text(input.branchName, pageX, 55);
  doc.font("bold").fontSize(15).fillColor(green).text(t.title, pageX, 70);

  let y = 118;
  doc.font("body").fontSize(10.5).fillColor(muted).text(t.client, pageX, y);
  doc
    .font("bold")
    .fontSize(15)
    .fillColor(dark)
    .text(input.client.fullName || "-", pageX, y + 15, { width: pageW });
  y += 54;

  doc.roundedRect(pageX, y, pageW, 150, 10).fillAndStroke("#FFFFFF", border);
  doc.font("bold").fontSize(12).fillColor(green).text(t.creditInterest, pageX + 16, y + 14);

  if (input.offer) {
    labelValue(t.purpose, textOrDash(input.offer.purpose), pageX + 16, y + 42, 235);
    labelValue(t.product, textOrDash(input.offer.productName), pageX + 280, y + 42, 235);
    labelValue(t.amount, fmtMoney(input.offer.amountUzs, currency), pageX + 16, y + 88, 150);
    labelValue(
      t.termRate,
      `${input.offer.termMonths ? `${input.offer.termMonths} ${monthUnit}` : "-"} / ${fmtPercent(input.offer.interestRate)}`,
      pageX + 186,
      y + 88,
      150,
    );
    labelValue(t.monthlyPayment, fmtMoney(input.offer.monthlyPaymentUzs, currency), pageX + 356, y + 88, 150);
  } else {
    doc.font("body").fontSize(11).fillColor(muted).text(t.noOffer, pageX + 16, y + 48, {
      width: pageW - 32,
      lineGap: 2,
    });
  }
  y += 172;

  doc.roundedRect(pageX, y, pageW, 118, 10).fillAndStroke("#FFFFFF", border);
  doc.font("bold").fontSize(12).fillColor(green).text(t.collateral, pageX + 16, y + 14);
  if (input.collateral) {
    labelValue(t.collateralValue, fmtMoney(input.collateral.acceptedValueUzs), pageX + 16, y + 42, 150);
    labelValue(t.collateralCoverage, fmtPercent(input.collateral.coveragePercent), pageX + 186, y + 42, 120);
    labelValue(t.collateralMaxLoan, fmtMoney(input.collateral.maxLoanAmountUzs), pageX + 326, y + 42, 180);
    // Only render a status pill when the source actually classified the
    // estimate. Previously an undefined resultStatus silently fell through
    // to "not_enough", showing the wrong verdict on incomplete records.
    if (input.collateral.resultStatus === "enough" || input.collateral.resultStatus === "not_enough") {
      const status =
        input.collateral.resultStatus === "enough" ? t.collateralEnough : t.collateralNotEnough;
      doc.font("bold").fontSize(10.5).fillColor(dark).text(status, pageX + 16, y + 88, {
        width: 170,
      });
    }
    const items = input.collateral.items?.filter(Boolean).slice(0, 3).join(", ");
    if (items) {
      doc.font("body").fontSize(9).fillColor(muted).text(items, pageX + 206, y + 88, {
        width: 300,
        ellipsis: true,
      });
    }
  } else {
    doc.font("body").fontSize(11).fillColor(muted).text(t.collateralNone, pageX + 16, y + 48, {
      width: pageW - 32,
    });
  }
  y += 140;

  doc.roundedRect(pageX, y, pageW, 86, 10).fillAndStroke("#ECFDF3", green);
  doc.font("bold").fontSize(11).fillColor("#15803D").text(t.expert, pageX + 16, y + 14);
  doc.font("bold").fontSize(15).fillColor(dark).text(input.expert.name, pageX + 16, y + 33, {
    width: 250,
  });
  doc.font("body").fontSize(9.5).fillColor(muted).text(t.callMe, pageX + 300, y + 18, {
    width: 200,
  });
  doc.font("bold").fontSize(15).fillColor(green).text(input.expert.phone, pageX + 300, y + 42, {
    width: 200,
  });

  doc.font("body").fontSize(8.5).fillColor("#94A3B8").text(t.disclaimer, pageX, 760, {
    width: pageW,
    align: "center",
  });

  doc.end();
  return done;
}
