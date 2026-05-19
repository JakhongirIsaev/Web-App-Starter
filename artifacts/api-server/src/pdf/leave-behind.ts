import PDFDocument from "pdfkit";
import { resolveBundledFonts } from "./generate";
import { formatUzs } from "../lib/money";

const STRINGS = {
  ru: {
    title: "Коммерческое предложение",
    headerBrand: "IPAK YO'LI BANK",
    headerTagline: "Банк для вашего бизнеса",
    metaDate: "Дата",
    metaBranch: "Филиал",
    client: "Клиент",
    creditInterest: "Параметры кредита",
    purpose: "Цель",
    product: "Кредитный продукт",
    amount: "Сумма",
    termRate: "Срок / ставка",
    monthlyPayment: "Платёж / мес",
    noOffer: "Расчёт кредита ещё не сохранён. Уточните сумму, срок и продукт.",
    collateral: "Залог",
    collateralValue: "Принятая стоимость",
    collateralCoverage: "Покрытие",
    collateralMaxLoan: "Максимальный кредит",
    collateralEnough: "ЗАЛОГА ДОСТАТОЧНО",
    collateralNotEnough: "НУЖНО УСИЛИТЬ ЗАЛОГ",
    collateralNone: "Залог пока не рассчитан",
    expert: "Ваш кредитный эксперт",
    callMe: "Звоните напрямую",
    disclaimer:
      "Документ носит предварительный характер. Финальные условия определяются после проверки документов и решения кредитного комитета банка.",
    footer: "© 2026 IPAK YO'LI Bank",
  },
  uz: {
    title: "Tijorat taklifi",
    headerBrand: "IPAK YO'LI BANK",
    headerTagline: "Biznesingiz uchun bank",
    metaDate: "Sana",
    metaBranch: "Filial",
    client: "Mijoz",
    creditInterest: "Kredit shartlari",
    purpose: "Maqsad",
    product: "Kredit mahsuloti",
    amount: "Summa",
    termRate: "Muddat / stavka",
    monthlyPayment: "Oylik to'lov",
    noOffer: "Kredit hisobi hali saqlanmagan. Summa, muddat va mahsulotni aniqlang.",
    collateral: "Garov",
    collateralValue: "Qabul qilingan qiymat",
    collateralCoverage: "Qoplama",
    collateralMaxLoan: "Maksimal kredit",
    collateralEnough: "GAROV YETARLI",
    collateralNotEnough: "GAROVNI KUCHAYTIRISH KERAK",
    collateralNone: "Garov hali hisoblanmagan",
    expert: "Sizning kredit ekspertingiz",
    callMe: "To'g'ridan-to'g'ri qo'ng'iroq qiling",
    disclaimer:
      "Ushbu hujjat taxminiy xarakterga ega. Yakuniy shartlar hujjatlar tekshiruvi va bank kredit qo'mitasi qaroridan keyin belgilanadi.",
    footer: "© 2026 IPAK YO'LI Bank",
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
  if (!Number.isFinite(value ?? NaN)) return "—";
  return `${formatUzs(Math.round(value!))} ${currency}`;
};

const fmtPercent = (value?: number | null) => {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value!)}%`;
};

const textOrDash = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
};

const formatToday = (language: "ru" | "uz") => {
  const fmt = new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return fmt.format(new Date());
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
  const green = "#136A2A";
  const greenAccent = "#15803D";
  const greenSoft = "#E8F5E9";
  const amber = "#B45309";
  const dark = "#0F172A";
  const muted = "#64748B";
  const mutedLight = "#94A3B8";
  const border = "#D9E7DF";
  const white = "#FFFFFF";

  const labelValue = (label: string, value: string, x: number, y: number, width: number) => {
    doc.font("body").fontSize(8.5).fillColor(muted).text(label, x, y, { width });
    doc.font("bold").fontSize(11).fillColor(dark).text(value, x, y + 13, {
      width,
      lineGap: 1,
    });
  };

  // ── Hero band ────────────────────────────────────────────────────────────
  doc.rect(0, 0, 595, 110).fill(green);

  doc.font("bold").fontSize(20).fillColor(white).text(t.headerBrand, pageX, 22);
  doc.font("body").fontSize(10).fillColor("#D9F2DE").text(t.headerTagline, pageX, 48);

  // Right-aligned meta block (date + branch)
  const metaX = 360;
  const metaW = 199;
  doc.font("body").fontSize(8.5).fillColor("#D9F2DE").text(t.metaDate, metaX, 22, {
    width: metaW,
    align: "right",
  });
  doc.font("bold").fontSize(10).fillColor(white).text(formatToday(input.language), metaX, 33, {
    width: metaW,
    align: "right",
  });
  doc.font("body").fontSize(8.5).fillColor("#D9F2DE").text(t.metaBranch, metaX, 52, {
    width: metaW,
    align: "right",
  });
  doc.font("bold").fontSize(10).fillColor(white).text(input.branchName, metaX, 63, {
    width: metaW,
    align: "right",
  });

  doc.font("bold").fontSize(17).fillColor(white).text(t.title, pageX, 80);

  // ── Client ───────────────────────────────────────────────────────────────
  let y = 132;
  doc.font("body").fontSize(10.5).fillColor(muted).text(t.client, pageX, y);
  doc
    .font("bold")
    .fontSize(16)
    .fillColor(dark)
    .text((input.client.fullName || "—").toUpperCase(), pageX, y + 15, { width: pageW });
  y += 56;

  // ── Credit interest card ────────────────────────────────────────────────
  doc.roundedRect(pageX, y, pageW, 150, 10).fillAndStroke(white, border);
  doc.font("bold").fontSize(12).fillColor(green).text(t.creditInterest, pageX + 16, y + 14);

  if (input.offer) {
    labelValue(t.purpose, textOrDash(input.offer.purpose), pageX + 16, y + 42, 235);
    labelValue(t.product, textOrDash(input.offer.productName), pageX + 272, y + 42, 235);
    labelValue(t.amount, fmtMoney(input.offer.amountUzs, currency), pageX + 16, y + 92, 170);
    labelValue(
      t.termRate,
      `${input.offer.termMonths ? `${input.offer.termMonths} ${monthUnit}` : "—"} / ${fmtPercent(input.offer.interestRate)}`,
      pageX + 196,
      y + 92,
      170,
    );
    labelValue(t.monthlyPayment, fmtMoney(input.offer.monthlyPaymentUzs, currency), pageX + 376, y + 92, 145);
  } else {
    doc.font("body").fontSize(11).fillColor(muted).text(t.noOffer, pageX + 16, y + 48, {
      width: pageW - 32,
      lineGap: 2,
    });
  }
  y += 172;

  // ── Collateral card ─────────────────────────────────────────────────────
  doc.roundedRect(pageX, y, pageW, 124, 10).fillAndStroke(white, border);
  doc.font("bold").fontSize(12).fillColor(green).text(t.collateral, pageX + 16, y + 14);

  if (input.collateral) {
    labelValue(t.collateralValue, fmtMoney(input.collateral.acceptedValueUzs), pageX + 16, y + 42, 170);
    labelValue(t.collateralCoverage, fmtPercent(input.collateral.coveragePercent), pageX + 196, y + 42, 120);
    labelValue(t.collateralMaxLoan, fmtMoney(input.collateral.maxLoanAmountUzs), pageX + 326, y + 42, 195);

    // Status pill — buyer demo money shot.
    if (input.collateral.resultStatus === "enough" || input.collateral.resultStatus === "not_enough") {
      const enough = input.collateral.resultStatus === "enough";
      const pillFill = enough ? green : amber;
      const status = enough ? t.collateralEnough : t.collateralNotEnough;
      const pillX = pageX + 16;
      const pillY = y + 92;
      const pillW = 180;
      doc.roundedRect(pillX, pillY, pillW, 22, 11).fill(pillFill);
      doc.font("bold").fontSize(9.5).fillColor(white).text(status, pillX, pillY + 6, {
        width: pillW,
        align: "center",
      });

      const items = input.collateral.items?.filter(Boolean).slice(0, 3).join(" · ");
      if (items) {
        doc.font("body").fontSize(9.5).fillColor(muted).text(items, pillX + pillW + 14, pillY + 6, {
          width: pageW - pillW - 32,
          ellipsis: true,
        });
      }
    }
  } else {
    doc.font("body").fontSize(11).fillColor(muted).text(t.collateralNone, pageX + 16, y + 48, {
      width: pageW - 32,
    });
  }
  y += 146;

  // ── Expert card ─────────────────────────────────────────────────────────
  doc.roundedRect(pageX, y, pageW, 92, 10).fillAndStroke(greenSoft, green);
  doc.font("bold").fontSize(11).fillColor(greenAccent).text(t.expert, pageX + 18, y + 14);
  doc.font("bold").fontSize(15).fillColor(dark).text(input.expert.name, pageX + 18, y + 34, {
    width: 280,
  });

  const phoneX = pageX + 310;
  doc.font("bold").fontSize(18).fillColor(green).text(`☎  ${input.expert.phone}`, phoneX, y + 30, {
    width: 200,
  });
  doc.font("body").fontSize(9).fillColor(muted).text(t.callMe, phoneX, y + 58, {
    width: 200,
  });
  y += 92 + 24;

  // ── Disclaimer (flows from card end, not pinned) ────────────────────────
  doc.font("body").fontSize(8.5).fillColor(mutedLight).text(t.disclaimer, pageX, y, {
    width: pageW,
    align: "left",
    lineGap: 2,
  });

  // ── Footer ──────────────────────────────────────────────────────────────
  const footerY = doc.page.height - 28;
  doc.font("body").fontSize(7.5).fillColor(mutedLight).text(t.footer, pageX, footerY, {
    width: pageW,
    align: "center",
  });

  doc.end();
  return done;
}
