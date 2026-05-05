import PDFDocument from "pdfkit";
import { resolveBundledFonts } from "./generate";

const STRINGS = {
  ru: {
    title: "Индикативное предложение",
    client: "Клиент",
    business: "Бизнес",
    indicativeRange: "Ориентировочная сумма кредита",
    indicativePayment: "Примерный ежемесячный платёж",
    couldFinance: "Что вы могли бы профинансировать",
    couldFinanceList:
      "Пополнение оборотных средств, оборудование, развитие бизнеса.",
    expert: "Ваш кредитный эксперт",
    callMe: "Есть вопросы? Звоните мне напрямую:",
    continueOnline: "Продолжить заявку:",
    disclaimer:
      "Информация в данном документе носит ориентировочный характер. " +
      "Окончательные условия определяются кредитным комитетом банка.",
  },
  uz: {
    title: "Indikativ taklif",
    client: "Mijoz",
    business: "Biznes",
    indicativeRange: "Taxminiy kredit summasi",
    indicativePayment: "Taxminiy oylik to'lov",
    couldFinance: "Nimani moliyalashtirishingiz mumkin",
    couldFinanceList:
      "Aylanma mablag'ni to'ldirish, uskunalar, biznesni rivojlantirish.",
    expert: "Sizning kredit ekspertingiz",
    callMe: "Savollar bor? To'g'ridan-to'g'ri qo'ng'iroq qiling:",
    continueOnline: "Arizani davom ettirish:",
    disclaimer:
      "Ushbu hujjatdagi ma'lumotlar taxminiy xarakterga ega. " +
      "Yakuniy shartlar bank kredit qo'mitasi tomonidan belgilanadi.",
  },
} as const;

const TG_URL = "t.me/IpakYoliBot";

const fmtUzs = (n: number) =>
  new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " UZS";

export interface LeaveBehindInput {
  client: { fullName?: string | null; businessName?: string | null };
  expert: { name: string; phone: string };
  indicative: {
    amountMinUzs: number;
    amountMaxUzs: number;
    monthlyMinUzs: number;
    monthlyMaxUzs: number;
    currency: "UZS";
  } | null;
  branchName: string;
  language: "ru" | "uz";
}

export async function generateLeaveBehindPdf(
  input: LeaveBehindInput,
): Promise<Buffer> {
  const fonts = resolveBundledFonts();
  const t = STRINGS[input.language];

  const doc = new PDFDocument({
    size: "A4",
    margin: 36,
    info: {
      Title: t.title,
      Author: input.expert.name,
      Subject: `${input.client.fullName ?? ""} — ${input.branchName}`,
    },
  });

  doc.registerFont("body", fonts.body);
  doc.registerFont("bold", fonts.bold);

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done: Promise<Buffer> = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // ── Header ──
  doc.font("bold").fontSize(20).fillColor("#0F172A").text("IPAK YO'LI Bank");
  doc.moveDown(0.2);
  doc.font("body").fontSize(10).fillColor("#64748B").text(input.branchName);
  doc.moveDown(0.6);
  doc.font("bold").fontSize(14).fillColor("#16A34A").text(t.title);
  doc.moveDown(1);

  // ── Client info ──
  doc.font("body").fontSize(11).fillColor("#0F172A");
  doc
    .text(`${t.client}: `, { continued: true })
    .font("bold")
    .text(input.client.fullName ?? "—");
  if (input.client.businessName) {
    doc
      .font("body")
      .text(`${t.business}: `, { continued: true })
      .font("bold")
      .text(input.client.businessName);
  }
  doc.moveDown(1);

  // ── Indicative range ──
  if (input.indicative) {
    doc.font("body").fontSize(11).fillColor("#64748B").text(t.indicativeRange);
    doc
      .font("bold")
      .fontSize(15)
      .fillColor("#0F172A")
      .text(
        `${fmtUzs(input.indicative.amountMinUzs)} – ${fmtUzs(input.indicative.amountMaxUzs)}`,
      );
    doc.moveDown(0.5);
    doc.font("body").fontSize(11).fillColor("#64748B").text(t.indicativePayment);
    doc
      .font("bold")
      .fontSize(13)
      .fillColor("#0F172A")
      .text(
        `${fmtUzs(input.indicative.monthlyMinUzs)} – ${fmtUzs(input.indicative.monthlyMaxUzs)}`,
      );
    doc.moveDown(1);
  }

  // ── What could be financed ──
  doc.font("bold").fontSize(11).fillColor("#0F172A").text(t.couldFinance);
  doc.font("body").fontSize(10).fillColor("#475569").text(t.couldFinanceList);
  doc.moveDown(1);

  // ── Expert block (highlighted box) ──
  const boxStartY = doc.y;
  doc.rect(36, boxStartY, 523, 70).fillAndStroke("#F0FDF4", "#16A34A");
  const innerY = boxStartY + 12;
  doc.font("bold").fontSize(11).fillColor("#15803D").text(t.expert, 48, innerY);
  doc
    .font("bold")
    .fontSize(14)
    .fillColor("#0F172A")
    .text(input.expert.name, 48, innerY + 16);
  doc
    .font("body")
    .fontSize(11)
    .fillColor("#475569")
    .text(t.callMe, 48, innerY + 36);
  doc
    .font("bold")
    .fontSize(13)
    .fillColor("#16A34A")
    .text(input.expert.phone, 48, innerY + 50);
  doc.y = boxStartY + 70 + 12;

  // ── Continue online ──
  doc
    .font("body")
    .fontSize(10)
    .fillColor("#64748B")
    .text(`${t.continueOnline} ${TG_URL}`);
  doc.moveDown(2);

  // ── Disclaimer ──
  doc
    .font("body")
    .fontSize(8)
    .fillColor("#94A3B8")
    .text(t.disclaimer, { align: "justify" });

  doc.end();
  return done;
}
