import { Router, type IRouter } from "express";
import {
  db,
  XLSX,
  clientsTable,
  usersTable,
  branchesTable,
  clientNotesTable,
  calculationsTable,
  clientDocumentsTable,
  eq,
  desc,
  or,
  guestAuth,
  formatDateTimeInAppTimeZone,
  formatFileDate,
  verifyClientAccess,
  MiniAppAutoExcelBody,
  forbidden,
  notFound,
  persistGeneratedClientDocument,
  resolvePdfLanguage,
  getAutoExcelCopy,
  getDocumentTypeLabel,
  getDocumentTypeFilePart,
  getExtractedFieldLabel,
} from "./_shared";

const router: IRouter = Router();
router.post("/mini-app/exports/auto-excel", guestAuth, async (req, res) => {
  const parsed = MiniAppAutoExcelBody.safeParse(req.body);
  if (!parsed.success) {
    // SKIP(PR-E1.5): bespoke envelope uses `issues:` field (not `details:`)
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
      forbidden(res, language === "ru" ? "Доступ запрещен" : "Ruxsat yo'q");
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


router.get("/mini-app/clients/:id/export", guestAuth, async (req, res) => {
  const clientId = Number(req.params.id);

  if (!(await verifyClientAccess(clientId, req.user!))) {
    forbidden(res, "Ruxsat yo'q");
    return;
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (!client) {
    notFound(res, "Mijoz topilmadi");
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
