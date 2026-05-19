import PDFDocument from "pdfkit";
import { resolveBundledFonts } from "./generate";
import { formatUzs } from "../lib/money";

const STRINGS = {
  ru: {
    title: "Коммерческое предложение",
    headerBrand: "MINERVA",
    headerTagline: "Платформа кредитования SME",
    metaDate: "Дата",
    metaBranch: "Филиал",
    client: "Клиент",
    phone: "Телефон",
    creditInterest: "Запрос клиента",
    purpose: "Цель кредита",
    amount: "Запрашиваемая сумма",
    term: "Срок",
    months: "мес",
    noOffer: "Клиент пока не указал желаемые параметры кредита.",
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
    footer: "© 2026 Minerva",
  },
  uz: {
    title: "Tijorat taklifi",
    headerBrand: "MINERVA",
    headerTagline: "SME kreditlash platformasi",
    metaDate: "Sana",
    metaBranch: "Filial",
    client: "Mijoz",
    phone: "Telefon",
    creditInterest: "Mijoz so'rovi",
    purpose: "Kredit maqsadi",
    amount: "So'ralgan summa",
    term: "Muddat",
    months: "oy",
    noOffer: "Mijoz hali kerakli kredit parametrlarini ko'rsatmagan.",
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
    footer: "© 2026 Minerva",
  },
} as const;

export interface LeaveBehindInput {
  client: {
    fullName?: string | null;
    legalName?: string | null;
    businessName?: string | null;
    phone?: string | null;
    purpose?: string | null;
    desiredAmountUzs?: number | string | null;
    desiredTermMonths?: number | null;
    preferredCurrency?: string | null;
  };
  expert: { name: string; phone: string };
  /** Legacy — ignored by the renderer; the credit-desire block now comes
   *  straight from the client row so the PDF reflects what the customer
   *  asked for, not the (possibly stale) calculator-derived offer. */
  offer?: {
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
  const currency = input.client.preferredCurrency || "UZS";
  const desiredAmount =
    input.client.desiredAmountUzs == null
      ? null
      : Number(input.client.desiredAmountUzs);
  const hasCreditDesire = Boolean(
    (input.client.purpose && input.client.purpose.trim()) ||
      (Number.isFinite(desiredAmount) && (desiredAmount as number) > 0) ||
      (input.client.desiredTermMonths && input.client.desiredTermMonths > 0),
  );

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
  // Kapitalbank brand: yellow #FFD531 + dark #272424.
  // Yellow as hero background needs DARK text for contrast; the legacy
  // variable names are retained to minimise churn elsewhere in the file.
  const green = "#FFD531";
  const greenAccent = "#272424";
  const greenSoft = "#FFF7D6";
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
  // Yellow hero with dark text for Kapitalbank brand contrast.
  doc.rect(0, 0, 595, 110).fill(green);

  doc.font("bold").fontSize(20).fillColor(dark).text(t.headerBrand, pageX, 22);
  doc.font("body").fontSize(10).fillColor("#6B5C00").text(t.headerTagline, pageX, 48);

  // Right-aligned meta block (date + branch)
  const metaX = 360;
  const metaW = 199;
  doc.font("body").fontSize(8.5).fillColor("#6B5C00").text(t.metaDate, metaX, 22, {
    width: metaW,
    align: "right",
  });
  doc.font("bold").fontSize(10).fillColor(dark).text(formatToday(input.language), metaX, 33, {
    width: metaW,
    align: "right",
  });
  doc.font("body").fontSize(8.5).fillColor("#6B5C00").text(t.metaBranch, metaX, 52, {
    width: metaW,
    align: "right",
  });
  doc.font("bold").fontSize(10).fillColor(dark).text(input.branchName, metaX, 63, {
    width: metaW,
    align: "right",
  });

  doc.font("bold").fontSize(17).fillColor(dark).text(t.title, pageX, 80);

  // ── Client info ──────────────────────────────────────────────────────────
  let y = 132;
  doc.font("body").fontSize(10.5).fillColor(muted).text(t.client, pageX, y);
  doc
    .font("bold")
    .fontSize(16)
    .fillColor(dark)
    .text((input.client.fullName || "—").toUpperCase(), pageX, y + 15, { width: pageW });
  y += 36;

  const subParts: string[] = [];
  if (input.client.legalName?.trim()) subParts.push(input.client.legalName.trim());
  if (input.client.businessName?.trim()) subParts.push(input.client.businessName.trim());
  if (subParts.length > 0) {
    doc.font("body").fontSize(10).fillColor(muted).text(subParts.join(" · "), pageX, y, {
      width: pageW,
    });
    y += 14;
  }
  if (input.client.phone?.trim()) {
    doc
      .font("body")
      .fontSize(10)
      .fillColor(muted)
      .text(`${t.phone}: `, pageX, y, { continued: true })
      .font("bold")
      .fillColor(dark)
      .text(input.client.phone.trim());
    y += 14;
  }
  y += 16;

  // ── Credit desire card (only what the client asked for) ────────────────
  doc.roundedRect(pageX, y, pageW, 116, 10).fillAndStroke(white, border);
  doc.font("bold").fontSize(12).fillColor(dark).text(t.creditInterest, pageX + 16, y + 14);

  if (hasCreditDesire) {
    labelValue(t.purpose, textOrDash(input.client.purpose), pageX + 16, y + 42, pageW - 32);
    labelValue(
      t.amount,
      Number.isFinite(desiredAmount) && (desiredAmount as number) > 0
        ? fmtMoney(desiredAmount as number, currency)
        : "—",
      pageX + 16,
      y + 78,
      260,
    );
    labelValue(
      t.term,
      input.client.desiredTermMonths
        ? `${input.client.desiredTermMonths} ${t.months}`
        : "—",
      pageX + 296,
      y + 78,
      225,
    );
  } else {
    doc.font("body").fontSize(11).fillColor(muted).text(t.noOffer, pageX + 16, y + 48, {
      width: pageW - 32,
      lineGap: 2,
    });
  }
  y += 138;

  // ── Collateral card ─────────────────────────────────────────────────────
  doc.roundedRect(pageX, y, pageW, 124, 10).fillAndStroke(white, border);
  doc.font("bold").fontSize(12).fillColor(dark).text(t.collateral, pageX + 16, y + 14);

  if (input.collateral) {
    labelValue(t.collateralValue, fmtMoney(input.collateral.acceptedValueUzs), pageX + 16, y + 42, 170);
    labelValue(t.collateralCoverage, fmtPercent(input.collateral.coveragePercent), pageX + 196, y + 42, 120);
    labelValue(t.collateralMaxLoan, fmtMoney(input.collateral.maxLoanAmountUzs), pageX + 326, y + 42, 195);

    // Status pill — buyer demo money shot.
    if (input.collateral.resultStatus === "enough" || input.collateral.resultStatus === "not_enough") {
      const enough = input.collateral.resultStatus === "enough";
      const pillFill = enough ? green : amber;
      // Yellow pill needs dark text; amber pill keeps white for contrast.
      const pillTextColor = enough ? dark : white;
      const status = enough ? t.collateralEnough : t.collateralNotEnough;
      const pillX = pageX + 16;
      const pillY = y + 92;
      const pillW = 180;
      doc.roundedRect(pillX, pillY, pillW, 22, 11).fill(pillFill);
      doc.font("bold").fontSize(9.5).fillColor(pillTextColor).text(status, pillX, pillY + 6, {
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
  // Two columns: left = label + name (identity); right = phone CTA stacked
  // (icon → number → micro-label). No overlap, generous spacing.
  const expertCardH = 104;
  doc.roundedRect(pageX, y, pageW, expertCardH, 10).fillAndStroke(greenSoft, green);

  // Left column — who.
  const leftX = pageX + 20;
  const leftW = 270;
  doc.font("bold").fontSize(10.5).fillColor(greenAccent).text(t.expert, leftX, y + 18, {
    width: leftW,
    characterSpacing: 0.5,
  });
  doc.font("bold").fontSize(17).fillColor(dark).text(input.expert.name, leftX, y + 40, {
    width: leftW,
    lineGap: 0,
  });

  // Right column — call me. Phone is the visual hero.
  const rightX = pageX + 300;
  const rightW = pageW - (rightX - pageX) - 20;
  // Small phone glyph as its own line, then the number large, then a quiet
  // micro-label. Each on its own y so wrapping never crashes them together.
  doc.font("bold").fontSize(13).fillColor(greenAccent).text("☎", rightX, y + 18, {
    width: rightW,
    align: "right",
  });
  doc.font("bold").fontSize(20).fillColor(dark).text(input.expert.phone, rightX, y + 40, {
    width: rightW,
    align: "right",
    lineGap: 0,
  });
  doc.font("body").fontSize(8.5).fillColor(muted).text(t.callMe, rightX, y + 72, {
    width: rightW,
    align: "right",
  });

  y += expertCardH + 22;

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
