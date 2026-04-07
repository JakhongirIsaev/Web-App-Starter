import PDFDocument from "pdfkit";

interface PdfData {
  client: {
    id: number;
    fullName: string | null;
    phone: string | null;
    sessionId: string;
    createdAt: Date;
    tin?: string | null;
    gender?: string | null;
    badges?: string[] | null;
  };
  basketItems: Array<{
    productName: string;
    productType?: string;
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
  aiSummary?: string;
  keyHighlights?: string[];
}

function fmtNum(val: string | number | null | undefined): string {
  if (!val) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return String(val);
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ru-RU", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function generateClientPdf(data: PdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `Коммерческое предложение — ${data.client.fullName || "Клиент"}`,
        Author: "Ipak Yuli Bank — Minerva",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const green = "#1B5E20";
    const greenLight = "#4CAF50";
    const gray = "#616161";
    const darkText = "#212121";
    const pageWidth = doc.page.width - 100;

    doc.rect(0, 0, doc.page.width, 120).fill(green);

    doc.fontSize(22).fillColor("#FFFFFF").text("IPAK YO'LI BANK", 50, 35, { align: "left" });
    doc.fontSize(10).fillColor("#C8E6C9").text("MINERVA — Кредитный эксперт", 50, 65, { align: "left" });

    doc.fontSize(14).fillColor("#FFFFFF").text("КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ", 50, 90, { align: "center", width: pageWidth });

    doc.moveDown(3);

    let y = 145;

    doc.fontSize(9).fillColor(gray);
    doc.text(`Дата: ${fmtDate(new Date())}`, 50, y);
    doc.text(`Эксперт: ${data.expertName}`, 50, y + 14);
    doc.text(`Филиал: ${data.branchName}`, 50, y + 28);
    doc.text(`Дело №: ${data.client.sessionId}`, 350, y);
    y += 55;

    doc.rect(50, y, pageWidth, 1).fill("#E0E0E0");
    y += 15;

    doc.fontSize(13).fillColor(green).text("Информация о клиенте", 50, y);
    y += 22;

    const clientInfo: [string, string][] = [
      ["ФИО", data.client.fullName || "—"],
      ["Телефон", data.client.phone || "—"],
      ["Дата регистрации", fmtDate(data.client.createdAt)],
    ];

    if (data.client.tin) clientInfo.push(["ИНН/СТИР", data.client.tin]);
    if (data.client.gender) clientInfo.push(["Пол", data.client.gender === "male" ? "Мужской" : "Женский"]);

    doc.fontSize(10);
    for (const [label, value] of clientInfo) {
      doc.fillColor(gray).text(label + ":", 50, y, { continued: false });
      doc.fillColor(darkText).text(String(value), 200, y);
      y += 18;
    }

    if (data.client.badges && data.client.badges.length > 0) {
      y += 5;
      doc.fontSize(9).fillColor(gray).text("Метки: " + data.client.badges.join(", "), 50, y);
      y += 16;
    }

    y += 15;

    if (data.aiSummary) {
      doc.rect(50, y, pageWidth, 1).fill("#E0E0E0");
      y += 15;
      doc.fontSize(13).fillColor(green).text("AI-анализ клиента", 50, y);
      y += 22;

      doc.fontSize(10).fillColor(darkText).text(data.aiSummary, 50, y, { width: pageWidth });
      y += doc.heightOfString(data.aiSummary, { width: pageWidth }) + 10;

      if (data.keyHighlights && data.keyHighlights.length > 0) {
        for (const highlight of data.keyHighlights) {
          doc.fontSize(9).fillColor(gray).text("• " + highlight, 60, y, { width: pageWidth - 20 });
          y += doc.heightOfString("• " + highlight, { width: pageWidth - 20 }) + 4;
        }
      }
      y += 10;
    }

    if (data.basketItems.length > 0) {
      doc.rect(50, y, pageWidth, 1).fill("#E0E0E0");
      y += 15;
      doc.fontSize(13).fillColor(green).text("Рекомендованные продукты", 50, y);
      y += 25;

      for (let i = 0; i < data.basketItems.length; i++) {
        const item = data.basketItems[i];
        doc.fontSize(10).fillColor(darkText);
        doc.text(`${i + 1}. ${item.productName}`, 60, y);
        if (item.productType) {
          doc.fontSize(8).fillColor(gray).text(`   Тип: ${item.productType}`, 60, y + 14);
          y += 14;
        }
        y += 18;
      }
      y += 10;
    }

    if (data.calculations.length > 0) {
      doc.rect(50, y, pageWidth, 1).fill("#E0E0E0");
      y += 15;
      doc.fontSize(13).fillColor(green).text("Расчёты по кредитным продуктам", 50, y);
      y += 25;

      for (const calc of data.calculations) {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }

        doc.rect(50, y, pageWidth, 28).fill("#F5F5F5");
        doc.fontSize(11).fillColor(green).text(calc.productName, 60, y + 7);
        y += 35;

        const rows = [
          ["Сумма кредита", `${fmtNum(calc.loanAmount)} ${calc.currency}`],
          ["Процентная ставка", `${calc.interestRate}% годовых`],
          ["Срок", `${calc.termMonths} мес.`],
          ["Тип погашения", calc.repaymentType === "annuity" ? "Аннуитетный" : "Дифференцированный"],
        ];

        if (calc.initialPayment && parseFloat(calc.initialPayment) > 0) {
          rows.push(["Первоначальный взнос", `${fmtNum(calc.initialPayment)} ${calc.currency}`]);
        }
        if (calc.gracePeriodMonths && calc.gracePeriodMonths > 0) {
          rows.push(["Льготный период", `${calc.gracePeriodMonths} мес.`]);
        }

        rows.push(
          ["Ежемесячный платёж", `${fmtNum(calc.monthlyPayment)} ${calc.currency}`],
          ["Общая сумма выплат", `${fmtNum(calc.totalPayment)} ${calc.currency}`],
          ["Переплата", `${fmtNum(calc.totalInterest)} ${calc.currency}`],
        );

        doc.fontSize(9);
        for (const [label, value] of rows) {
          doc.fillColor(gray).text(label + ":", 70, y);
          doc.fillColor(darkText).text(value, 250, y);
          y += 16;
        }

        y += 15;
      }
    }

    if (y > 680) {
      doc.addPage();
      y = 50;
    }

    y += 20;
    doc.rect(50, y, pageWidth, 1).fill("#E0E0E0");
    y += 20;

    doc.fontSize(8).fillColor(gray);
    doc.text("Данное коммерческое предложение носит информационный характер и не является офертой.", 50, y, { width: pageWidth, align: "center" });
    y += 14;
    doc.text("Окончательные условия кредитования определяются после рассмотрения заявки.", 50, y, { width: pageWidth, align: "center" });
    y += 14;
    doc.text(`© ${new Date().getFullYear()} Ipak Yo'li Bank. Все права защищены.`, 50, y, { width: pageWidth, align: "center" });

    doc.end();
  });
}
