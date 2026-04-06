import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { buildPaymentSchedule } from "../lib/calculations";
import { formatDateInAppTimeZone } from "../lib/timezone";

interface PreferenceItem {
  label: string;
  value: string;
}

type PdfLanguage = "ru" | "uz" | "en";
type FontName = "body" | "bold";
type PdfDoc = InstanceType<typeof PDFDocument>;

interface PdfBasketItem {
  productName?: string;
  name?: string;
  productType?: string | null;
  sapCode?: string | null;
  segment?: string | null;
  disbursementForm?: string | null;
  loanAmount?: string | null;
  termWorkingCapital?: string | null;
  termFixedAssets?: string | null;
  termUntargeted?: string | null;
  rateUZS?: string | null;
  rateUSD?: string | null;
  rateEUR?: string | null;
  gracePeriod?: string | null;
  purpose?: string | null;
  highlight?: string | null;
  notes?: string | null;
  whySuitable?: string | null;
  localizedSegment?: string | null;
  localizedPurpose?: string | null;
  localizedHighlight?: string | null;
  localizedLoanAmount?: string | null;
  localizedRate?: string | null;
  localizedRelevantTerm?: string | null;
  localizedDisbursementForm?: string | null;
  localizedGracePeriod?: string | null;
}

interface PdfCalculation {
  productName: string;
  loanAmount: string;
  interestRate: string;
  termMonths: number;
  repaymentType: string;
  initialPayment?: string | null;
  gracePeriodMonths?: number | null;
  monthlyPayment?: string | null;
  totalPayment?: string | null;
  totalInterest?: string | null;
  currency: string;
}

interface PdfData {
  client: {
    id: number;
    fullName: string | null;
    phone: string | null;
    sessionId: string;
    createdAt: Date | string;
  };
  basketItems: PdfBasketItem[];
  calculations: PdfCalculation[];
  expertName: string;
  branchName: string;
  preferenceSummary?: PreferenceItem[];
  offerSummary?: string | null;
  language?: PdfLanguage;
}

function resolveFontCandidates() {
  const regularCandidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
    "C:\\Windows\\Fonts\\segoeui.ttf",
  ];
  const boldCandidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    "C:\\Windows\\Fonts\\arialbd.ttf",
    "C:\\Windows\\Fonts\\segoeuib.ttf",
  ];

  const body = regularCandidates.find((candidate) => existsSync(candidate));
  const bold = boldCandidates.find((candidate) => existsSync(candidate));

  return { body, bold };
}

function createFontApplier(doc: PdfDoc) {
  const fonts = resolveFontCandidates();
  if (fonts.body) doc.registerFont("minerva-body", fonts.body);
  if (fonts.bold) doc.registerFont("minerva-bold", fonts.bold);

  return (fontName: FontName) => {
    if (fontName === "bold" && fonts.bold) {
      doc.font("minerva-bold");
      return;
    }
    if (fonts.body) {
      doc.font("minerva-body");
      return;
    }
    doc.font(fontName === "bold" ? "Helvetica-Bold" : "Helvetica");
  };
}

function ensureSpace(doc: PdfDoc, y: number, needed: number) {
  const bottomLimit = doc.page.height - 72;
  if (y + needed <= bottomLimit) return y;
  doc.addPage();
  return 56;
}

function resolveLocale(language: PdfLanguage) {
  if (language === "ru") return "ru-RU";
  if (language === "en") return "en-US";
  return "uz-UZ";
}

function fmtNum(
  value: string | number | null | undefined,
  language: PdfLanguage,
): string {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(parsed)) return String(value);
  return parsed.toLocaleString(resolveLocale(language), {
    maximumFractionDigits: 2,
  });
}

function fmtDate(value: Date | string, language: PdfLanguage) {
  return formatDateInAppTimeZone(value, resolveLocale(language));
}

function safeValue(value: string | null | undefined) {
  return value && value.trim() ? value.trim() : "-";
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

function isCompatibleWithLanguage(
  value: string | null | undefined,
  language: PdfLanguage,
) {
  if (!value || !value.trim()) return false;

  const text = value.trim();
  const cyrillic = countMatches(text, /[\u0400-\u04FF]/g);
  const latin = countMatches(text, /[A-Za-z]/g);

  if (language === "uz") {
    if (cyrillic > latin) return false;
    return true;
  }

  if (language === "ru") {
    if (cyrillic > 0) return true;
    return latin === 0;
  }

  return true;
}

function buildRateSummary(item: PdfBasketItem) {
  return [item.rateUZS, item.rateUSD, item.rateEUR].filter(Boolean).join(" | ");
}

function buildRelevantTerms(item: PdfBasketItem) {
  return [item.termWorkingCapital, item.termFixedAssets, item.termUntargeted]
    .filter(Boolean)
    .join(" | ");
}

function getDisplayValueForLanguage(
  language: PdfLanguage,
  localizedValue: string | null | undefined,
  fallbackValue: string | null | undefined,
) {
  if (isCompatibleWithLanguage(localizedValue, language)) {
    return localizedValue!.trim();
  }

  if (isCompatibleWithLanguage(fallbackValue, language)) {
    return fallbackValue!.trim();
  }

  return "-";
}

function getPdfCopy(language: PdfLanguage) {
  if (language === "ru") {
    return {
      title: "Коммерческое предложение для клиента",
      subtitle: "MINERVA - помощник кредитного эксперта",
      metaDate: "Дата",
      metaExpert: "Эксперт",
      metaBranch: "Филиал",
      metaCase: "Номер кейса",
      clientSection: "Информация о клиенте",
      clientName: "Ф.И.О.",
      clientPhone: "Телефон",
      clientCreatedAt: "Дата регистрации",
      preferencesSection: "Потребности и предпочтения клиента",
      productsSection: "Рекомендуемые продукты",
      noProducts:
        "В корзине пока нет продуктов. Сначала подберите для клиента подходящие варианты.",
      productIndex: "Продукт",
      sapCode: "SAP код",
      segment: "Сегмент",
      loanAmount: "Сумма кредита",
      availableTerms: "Доступные сроки",
      disbursementForm: "Форма выдачи",
      gracePeriod: "Льготный период",
      rates: "Ставки",
      purpose: "Назначение продукта",
      highlight: "Ключевое преимущество",
      calculationsSection: "Результаты расчета",
      noCalculations:
        "Для этого клиента пока нет сохраненного кредитного расчета.",
      interestRate: "Процентная ставка",
      term: "Срок",
      repaymentType: "Тип погашения",
      initialPayment: "Первоначальный взнос",
      monthlyPayment: "Ежемесячный платеж",
      totalPayment: "Общая выплата",
      totalInterest: "Общие проценты",
      monthsSuffix: "мес.",
      repaymentAnnuity: "Аннуитет",
      repaymentDifferentiated: "Дифференцированный",
      scheduleSection: "График ежемесячных платежей",
      scheduleMonth: "Месяц",
      schedulePayment: "Платеж",
      schedulePrincipal: "Основной долг",
      scheduleInterest: "Проценты",
      scheduleRemaining: "Остаток",
      footerNote:
        "Документ подготовлен для предварительного обсуждения. Окончательные условия финансирования утверждаются банком после проверки документов и риск-анализа.",
      footerCopyright: `© ${new Date().getFullYear()} Ipak Yo'li Bank. Все права защищены.`,
    } as const;
  }

  if (language === "en") {
    return {
      title: "Commercial offer for the client",
      subtitle: "MINERVA - credit expert assistant",
      metaDate: "Date",
      metaExpert: "Expert",
      metaBranch: "Branch",
      metaCase: "Case number",
      clientSection: "Client information",
      clientName: "Client name",
      clientPhone: "Phone",
      clientCreatedAt: "Registered on",
      preferencesSection: "Client needs and preferences",
      productsSection: "Recommended products",
      noProducts:
        "There are no products in the basket yet. Select suitable options for the client first.",
      productIndex: "Product",
      sapCode: "SAP code",
      segment: "Segment",
      loanAmount: "Loan amount",
      availableTerms: "Available terms",
      disbursementForm: "Disbursement form",
      gracePeriod: "Grace period",
      rates: "Rates",
      purpose: "Product purpose",
      highlight: "Key advantage",
      calculationsSection: "Calculation results",
      noCalculations:
        "No saved loan calculation is available for this client yet.",
      interestRate: "Interest rate",
      term: "Term",
      repaymentType: "Repayment type",
      initialPayment: "Initial payment",
      monthlyPayment: "Monthly payment",
      totalPayment: "Total payment",
      totalInterest: "Total interest",
      monthsSuffix: "months",
      repaymentAnnuity: "Annuity",
      repaymentDifferentiated: "Differentiated",
      scheduleSection: "Monthly payment schedule",
      scheduleMonth: "Month",
      schedulePayment: "Payment",
      schedulePrincipal: "Principal",
      scheduleInterest: "Interest",
      scheduleRemaining: "Balance",
      footerNote:
        "This document is prepared for preliminary discussion. Final financing terms are confirmed by the bank after document review and risk analysis.",
      footerCopyright: `© ${new Date().getFullYear()} Ipak Yo'li Bank. All rights reserved.`,
    } as const;
  }

  return {
    title: "Mijoz uchun tijorat taklifi",
    subtitle: "MINERVA - kredit eksperti yordamchisi",
    metaDate: "Sana",
    metaExpert: "Ekspert",
    metaBranch: "Filial",
    metaCase: "Ish raqami",
    clientSection: "Mijoz ma'lumotlari",
    clientName: "F.I.Sh.",
    clientPhone: "Telefon",
    clientCreatedAt: "Ro'yxatdan o'tgan sana",
    preferencesSection: "Mijoz ehtiyojlari va afzalliklari",
    productsSection: "Tavsiya etilgan mahsulotlar",
    noProducts:
      "Savatda mahsulotlar yo'q. Avval mijoz uchun mos mahsulotlarni tanlang.",
    productIndex: "Mahsulot",
    sapCode: "SAP kodi",
    segment: "Segment",
    loanAmount: "Kredit summasi",
    availableTerms: "Mavjud muddatlar",
    disbursementForm: "Berish shakli",
    gracePeriod: "Imtiyozli davr",
    rates: "Stavkalar",
    purpose: "Mahsulot maqsadi",
    highlight: "Asosiy afzalligi",
    calculationsSection: "Hisob-kitob natijalari",
    noCalculations:
      "Ushbu mijoz uchun hali saqlangan kredit hisob-kitobi mavjud emas.",
    interestRate: "Foiz stavkasi",
    term: "Muddat",
    repaymentType: "To'lov turi",
    initialPayment: "Boshlang'ich to'lov",
    monthlyPayment: "Oylik to'lov",
    totalPayment: "Jami to'lov",
    totalInterest: "Foizlar bo'yicha jami",
    monthsSuffix: "oy",
    repaymentAnnuity: "Annuitet",
    repaymentDifferentiated: "Differensial",
    scheduleSection: "Oylik to'lov jadvali",
    scheduleMonth: "Oy",
    schedulePayment: "To'lov",
    schedulePrincipal: "Asosiy qarz",
    scheduleInterest: "Foiz",
    scheduleRemaining: "Qoldiq",
    footerNote:
      "Mazkur hujjat dastlabki muhokama uchun tayyorlangan. Yakuniy moliyalashtirish shartlari hujjatlar tekshiruvi va risk tahlilidan keyin bank tomonidan tasdiqlanadi.",
    footerCopyright: `© ${new Date().getFullYear()} Ipak Yo'li Bank. Barcha huquqlar himoyalangan.`,
  } as const;
}

export function generateClientPdf(data: PdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const language = data.language ?? "uz";
    const copy = getPdfCopy(language);
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `${copy.title} - ${data.client.fullName || "Client"}`,
        Author: "Ipak Yo'li Bank - Minerva",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const useFont = createFontApplier(doc);
    const green = "#136A2A";
    const greenSoft = "#E8F5E9";
    const darkText = "#1F2937";
    const muted = "#6B7280";
    const line = "#D1D5DB";
    const contentWidth = doc.page.width - 100;

    const drawSectionTitle = (title: string, y: number) => {
      y = ensureSpace(doc, y, 36);
      doc.save();
      doc.roundedRect(50, y, contentWidth, 26, 8).fill(greenSoft);
      doc.restore();
      useFont("bold");
      doc.fontSize(12).fillColor(green).text(title, 62, y + 7);
      return y + 36;
    };

    const drawRow = (label: string, value: string, y: number) => {
      y = ensureSpace(doc, y, 22);
      useFont("bold");
      doc.fontSize(9).fillColor(muted).text(label, 50, y, { width: 150 });
      useFont("body");
      doc
        .fontSize(10)
        .fillColor(darkText)
        .text(value || "-", 205, y, { width: contentWidth - 155 });
      return y + Math.max(doc.heightOfString(value || "-", { width: contentWidth - 155 }), 16) + 4;
    };

    const drawParagraph = (
      text: string,
      y: number,
      options?: { color?: string; size?: number },
    ) => {
      y = ensureSpace(doc, y, 30);
      useFont("body");
      doc
        .fontSize(options?.size ?? 10)
        .fillColor(options?.color ?? darkText)
        .text(text, 50, y, { width: contentWidth });
      return y + doc.heightOfString(text, { width: contentWidth }) + 8;
    };

    const drawScheduleHeader = (y: number) => {
      y = ensureSpace(doc, y, 24);
      doc.save();
      doc.roundedRect(50, y, contentWidth, 20, 6).fill("#F3F4F6");
      doc.restore();

      useFont("bold");
      doc.fontSize(8).fillColor(muted);
      doc.text(copy.scheduleMonth, 56, y + 6, { width: 40 });
      doc.text(copy.schedulePayment, 100, y + 6, {
        width: 100,
        align: "right",
      });
      doc.text(copy.schedulePrincipal, 205, y + 6, {
        width: 100,
        align: "right",
      });
      doc.text(copy.scheduleInterest, 310, y + 6, {
        width: 85,
        align: "right",
      });
      doc.text(copy.scheduleRemaining, 400, y + 6, {
        width: 95,
        align: "right",
      });
      return y + 24;
    };

    const drawScheduleTable = (
      calculation: PdfCalculation,
      y: number,
    ) => {
      const schedule = buildPaymentSchedule(calculation);
      if (schedule.length === 0) return y;

      y = drawSectionTitle(`${copy.scheduleSection}: ${calculation.productName}`, y);
      y = drawScheduleHeader(y);

      for (const row of schedule) {
        const rowHeight = 18;
        const nextY = ensureSpace(doc, y, rowHeight);
        if (nextY !== y) {
          y = drawScheduleHeader(nextY);
        }

        useFont("body");
        doc.fontSize(8.5).fillColor(darkText);
        doc.text(String(row.month), 56, y + 4, { width: 40 });
        doc.text(
          fmtNum(row.payment, language),
          100,
          y + 4,
          { width: 100, align: "right" },
        );
        doc.text(
          fmtNum(row.principal, language),
          205,
          y + 4,
          { width: 100, align: "right" },
        );
        doc.text(
          fmtNum(row.interest, language),
          310,
          y + 4,
          { width: 85, align: "right" },
        );
        doc.text(
          fmtNum(row.remaining, language),
          400,
          y + 4,
          { width: 95, align: "right" },
        );

        doc
          .moveTo(50, y + rowHeight)
          .lineTo(50 + contentWidth, y + rowHeight)
          .strokeColor("#F3F4F6")
          .stroke();
        y += rowHeight;
      }

      return y + 8;
    };

    const preferenceSummary = data.preferenceSummary || [];

    doc.save();
    doc.rect(0, 0, doc.page.width, 122).fill(green);
    doc.restore();

    useFont("bold");
    doc.fontSize(24).fillColor("#FFFFFF").text("IPAK YO'LI BANK", 50, 32);
    useFont("body");
    doc.fontSize(11).fillColor("#D1FAE5").text(copy.subtitle, 50, 66);
    useFont("bold");
    doc.fontSize(15).fillColor("#FFFFFF").text(copy.title, 50, 90, {
      width: contentWidth,
      align: "center",
    });

    let y = 145;
    y = drawRow(copy.metaDate, fmtDate(new Date(), language), y);
    y = drawRow(copy.metaExpert, data.expertName || "-", y);
    y = drawRow(copy.metaBranch, data.branchName || "-", y);
    y = drawRow(copy.metaCase, data.client.sessionId || "-", y);

    y += 8;
    doc.moveTo(50, y).lineTo(50 + contentWidth, y).strokeColor(line).stroke();
    y += 16;

    y = drawSectionTitle(copy.clientSection, y);
    y = drawRow(copy.clientName, data.client.fullName || "-", y);
    y = drawRow(copy.clientPhone, data.client.phone || "-", y);
    y = drawRow(copy.clientCreatedAt, fmtDate(data.client.createdAt, language), y);

    if (preferenceSummary.length > 0) {
      y = drawSectionTitle(copy.preferencesSection, y + 8);
      for (const item of preferenceSummary) {
        y = drawRow(item.label, item.value, y);
      }
    }

    y = drawSectionTitle(copy.productsSection, y + 8);
    if (data.basketItems.length === 0) {
      y = drawParagraph(copy.noProducts, y, { color: muted });
    } else {
      data.basketItems.forEach((item, index) => {
        y = ensureSpace(doc, y, 120);
        const productName = item.productName || item.name || `${copy.productIndex} ${index + 1}`;
        useFont("bold");
        doc
          .fontSize(11)
          .fillColor(green)
          .text(`${index + 1}. ${productName}`, 50, y, { width: contentWidth });
        y += 20;

        const detailRows: PreferenceItem[] = [];

        if (item.sapCode) {
          detailRows.push({ label: copy.sapCode, value: item.sapCode });
        }

        const segmentValue = getDisplayValueForLanguage(
          language,
          item.localizedSegment,
          item.segment,
        );
        if (segmentValue !== "-") {
          detailRows.push({ label: copy.segment, value: segmentValue });
        }

        const amountValue = getDisplayValueForLanguage(
          language,
          item.localizedLoanAmount,
          item.loanAmount,
        );
        if (amountValue !== "-") {
          detailRows.push({ label: copy.loanAmount, value: amountValue });
        }

        const termValue = getDisplayValueForLanguage(
          language,
          item.localizedRelevantTerm,
          buildRelevantTerms(item),
        );
        if (termValue !== "-") {
          detailRows.push({ label: copy.availableTerms, value: termValue });
        }

        const disbursementValue = getDisplayValueForLanguage(
          language,
          item.localizedDisbursementForm,
          item.disbursementForm,
        );
        if (disbursementValue !== "-") {
          detailRows.push({
            label: copy.disbursementForm,
            value: disbursementValue,
          });
        }

        const graceValue = getDisplayValueForLanguage(
          language,
          item.localizedGracePeriod,
          item.gracePeriod,
        );
        if (graceValue !== "-") {
          detailRows.push({ label: copy.gracePeriod, value: graceValue });
        }

        const rateValue = getDisplayValueForLanguage(
          language,
          item.localizedRate,
          buildRateSummary(item),
        );
        if (rateValue !== "-") {
          detailRows.push({ label: copy.rates, value: rateValue });
        }

        const purposeValue = getDisplayValueForLanguage(
          language,
          item.localizedPurpose,
          item.purpose,
        );
        if (purposeValue !== "-") {
          detailRows.push({ label: copy.purpose, value: purposeValue });
        }

        const highlightValue = getDisplayValueForLanguage(
          language,
          item.localizedHighlight,
          item.highlight,
        );
        if (highlightValue !== "-") {
          detailRows.push({ label: copy.highlight, value: highlightValue });
        }

        for (const row of detailRows) {
          y = drawRow(row.label, row.value, y);
        }

        y += 6;
      });
    }

    y = drawSectionTitle(copy.calculationsSection, y + 8);
    if (data.calculations.length === 0) {
      y = drawParagraph(copy.noCalculations, y, { color: muted });
    } else {
      data.calculations.forEach((calculation) => {
        y = ensureSpace(doc, y, 132);
        useFont("bold");
        doc
          .fontSize(11)
          .fillColor(green)
          .text(calculation.productName, 50, y, { width: contentWidth });
        y += 18;

        y = drawRow(
          copy.loanAmount,
          `${fmtNum(calculation.loanAmount, language)} ${calculation.currency}`,
          y,
        );
        y = drawRow(
          copy.interestRate,
          `${calculation.interestRate}%`,
          y,
        );
        y = drawRow(
          copy.term,
          `${calculation.termMonths} ${copy.monthsSuffix}`,
          y,
        );
        y = drawRow(
          copy.repaymentType,
          calculation.repaymentType === "annuity"
            ? copy.repaymentAnnuity
            : copy.repaymentDifferentiated,
          y,
        );

        if (calculation.initialPayment && Number.parseFloat(calculation.initialPayment) > 0) {
          y = drawRow(
            copy.initialPayment,
            `${fmtNum(calculation.initialPayment, language)} ${calculation.currency}`,
            y,
          );
        }
        if (calculation.gracePeriodMonths && calculation.gracePeriodMonths > 0) {
          y = drawRow(
            copy.gracePeriod,
            `${calculation.gracePeriodMonths} ${copy.monthsSuffix}`,
            y,
          );
        }

        y = drawRow(
          copy.monthlyPayment,
          `${fmtNum(calculation.monthlyPayment, language)} ${calculation.currency}`,
          y,
        );
        y = drawRow(
          copy.totalPayment,
          `${fmtNum(calculation.totalPayment, language)} ${calculation.currency}`,
          y,
        );
        y = drawRow(
          copy.totalInterest,
          `${fmtNum(calculation.totalInterest, language)} ${calculation.currency}`,
          y,
        );

        y += 8;
        y = drawScheduleTable(calculation, y);
      });
    }

    y += 6;
    y = drawParagraph(copy.footerNote, y, {
      color: muted,
      size: 9,
    });

    useFont("body");
    doc.fontSize(8).fillColor(muted).text(
      copy.footerCopyright,
      50,
      doc.page.height - 36,
      { width: contentWidth, align: "center" },
    );

    doc.end();
  });
}
