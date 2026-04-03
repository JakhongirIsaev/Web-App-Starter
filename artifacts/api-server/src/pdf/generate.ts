import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";

interface PreferenceItem {
  label: string;
  value: string;
}

interface PdfData {
  client: {
    id: number;
    fullName: string | null;
    phone: string | null;
    sessionId: string;
    createdAt: Date | string;
  };
  basketItems: Array<{
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
  }>;
  calculations: Array<{
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
  }>;
  expertName: string;
  branchName: string;
  preferenceSummary?: PreferenceItem[];
}

type FontName = "body" | "bold";
type PdfDoc = InstanceType<typeof PDFDocument>;

function fmtNum(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === "") return "-";
  const n = typeof val === "string" ? Number.parseFloat(val) : val;
  if (Number.isNaN(n)) return String(val);
  return n.toLocaleString("uz-UZ", { maximumFractionDigits: 2 });
}

function fmtDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("uz-UZ", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function buildRateSummary(item: PdfData["basketItems"][number]) {
  return [
    item.rateUZS ? `UZS: ${item.rateUZS}` : null,
    item.rateUSD ? `USD: ${item.rateUSD}` : null,
    item.rateEUR ? `EUR: ${item.rateEUR}` : null,
  ].filter(Boolean).join(" | ");
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

export function generateClientPdf(data: PdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `Tijorat taklifi - ${data.client.fullName || "Mijoz"}`,
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
      doc.fontSize(10).fillColor(darkText).text(value || "-", 205, y, { width: contentWidth - 155 });
      return y + Math.max(doc.heightOfString(value || "-", { width: contentWidth - 155 }), 16) + 4;
    };

    const drawParagraph = (text: string, y: number, options?: { color?: string; size?: number }) => {
      y = ensureSpace(doc, y, 30);
      useFont("body");
      doc
        .fontSize(options?.size ?? 10)
        .fillColor(options?.color ?? darkText)
        .text(text, 50, y, { width: contentWidth });
      return y + doc.heightOfString(text, { width: contentWidth }) + 8;
    };

    const preferenceSummary = data.preferenceSummary || [];

    doc.save();
    doc.rect(0, 0, doc.page.width, 122).fill(green);
    doc.restore();

    useFont("bold");
    doc.fontSize(24).fillColor("#FFFFFF").text("IPAK YO'LI BANK", 50, 32);
    useFont("body");
    doc.fontSize(11).fillColor("#D1FAE5").text("MINERVA - kredit eksperti yordamchisi", 50, 66);
    useFont("bold");
    doc.fontSize(15).fillColor("#FFFFFF").text("Mijoz uchun tijorat taklifi", 50, 90, {
      width: contentWidth,
      align: "center",
    });

    let y = 145;
    y = drawRow("Sana", fmtDate(new Date()), y);
    y = drawRow("Ekspert", data.expertName || "-", y);
    y = drawRow("Filial", data.branchName || "-", y);
    y = drawRow("Ish raqami", data.client.sessionId || "-", y);

    y += 8;
    doc.moveTo(50, y).lineTo(50 + contentWidth, y).strokeColor(line).stroke();
    y += 16;

    y = drawSectionTitle("Mijoz ma'lumotlari", y);
    y = drawRow("F.I.Sh.", data.client.fullName || "-", y);
    y = drawRow("Telefon", data.client.phone || "-", y);
    y = drawRow("Ro'yxatga olingan sana", fmtDate(data.client.createdAt), y);

    if (preferenceSummary.length > 0) {
      y = drawSectionTitle("Mijoz ehtiyojlari va afzalliklari", y + 8);
      for (const item of preferenceSummary) {
        y = drawRow(item.label, item.value, y);
      }
    }

    y = drawSectionTitle("Tavsiya etilgan mahsulotlar", y + 8);
    if (data.basketItems.length === 0) {
      y = drawParagraph("Savatda mahsulotlar yo'q. Avval mijoz uchun mos mahsulotlarni tanlang.", y, {
        color: muted,
      });
    } else {
      data.basketItems.forEach((item, index) => {
        y = ensureSpace(doc, y, 120);
        const productName = item.productName || item.name || `Mahsulot ${index + 1}`;
        useFont("bold");
        doc.fontSize(11).fillColor(green).text(`${index + 1}. ${productName}`, 50, y, { width: contentWidth });
        y += 20;

        const detailRows: PreferenceItem[] = [
          item.sapCode ? { label: "SAP kodi", value: item.sapCode } : null,
          item.segment ? { label: "Segment", value: item.segment } : null,
          item.loanAmount ? { label: "Kredit summasi", value: item.loanAmount } : null,
          (item.termWorkingCapital || item.termFixedAssets || item.termUntargeted)
            ? {
                label: "Mavjud muddatlar",
                value: [item.termWorkingCapital, item.termFixedAssets, item.termUntargeted].filter(Boolean).join(" | "),
              }
            : null,
          item.disbursementForm ? { label: "Berish shakli", value: item.disbursementForm } : null,
          item.gracePeriod ? { label: "Imtiyozli davr", value: item.gracePeriod } : null,
          buildRateSummary(item) ? { label: "Stavkalar", value: buildRateSummary(item) } : null,
        ].filter((row): row is PreferenceItem => Boolean(row));

        for (const row of detailRows) {
          y = drawRow(row.label, row.value, y);
        }

        if (item.purpose) {
          y = drawRow("Mahsulot maqsadi", item.purpose, y);
        }
        if (item.highlight) {
          y = drawRow("Asosiy afzalligi", item.highlight, y);
        }
        y = drawRow("Nima uchun mos", item.whySuitable || item.notes || "Mahsulot mijoz ehtiyojlariga mos kelgani uchun tavsiya qilindi.", y);
        y += 6;
      });
    }

    y = drawSectionTitle("Hisob-kitob natijalari", y + 8);
    if (data.calculations.length === 0) {
      y = drawParagraph("Ushbu mijoz uchun alohida kredit hisob-kitobi saqlanmagan.", y, { color: muted });
    } else {
      data.calculations.forEach((calc) => {
        y = ensureSpace(doc, y, 118);
        useFont("bold");
        doc.fontSize(11).fillColor(green).text(calc.productName, 50, y, { width: contentWidth });
        y += 18;

        y = drawRow("Kredit summasi", `${fmtNum(calc.loanAmount)} ${calc.currency}`, y);
        y = drawRow("Foiz stavkasi", `${calc.interestRate}%`, y);
        y = drawRow("Muddat", `${calc.termMonths} oy`, y);
        y = drawRow("To'lov turi", calc.repaymentType === "annuity" ? "Annuitet" : "Differensial", y);

        if (calc.initialPayment && Number.parseFloat(calc.initialPayment) > 0) {
          y = drawRow("Boshlang'ich to'lov", `${fmtNum(calc.initialPayment)} ${calc.currency}`, y);
        }
        if (calc.gracePeriodMonths && calc.gracePeriodMonths > 0) {
          y = drawRow("Imtiyozli davr", `${calc.gracePeriodMonths} oy`, y);
        }

        y = drawRow("Oylik to'lov", `${fmtNum(calc.monthlyPayment)} ${calc.currency}`, y);
        y = drawRow("Jami to'lov", `${fmtNum(calc.totalPayment)} ${calc.currency}`, y);
        y = drawRow("Foizlar bo'yicha jami", `${fmtNum(calc.totalInterest)} ${calc.currency}`, y);
        y += 8;
      });
    }

    y += 6;
    y = drawParagraph(
      "Mazkur hujjat maslahat va dastlabki tanlov uchun tayyorlangan. Yakuniy kredit shartlari mijoz hujjatlari va risk tahlili asosida bank tomonidan tasdiqlanadi.",
      y,
      { color: muted, size: 9 }
    );

    useFont("body");
    doc.fontSize(8).fillColor(muted).text(
      `© ${new Date().getFullYear()} Ipak Yo'li Bank. Barcha huquqlar himoyalangan.`,
      50,
      doc.page.height - 36,
      { width: contentWidth, align: "center" }
    );

    doc.end();
  });
}
