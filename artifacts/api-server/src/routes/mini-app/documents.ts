import { Router, type IRouter } from "express";
import {
  db,
  clientDocumentsTable,
  eq,
  desc,
  guestAuth,
  validateExtractedData,
  requireDocumentAccess,
  verifyClientAccess,
  MiniAppDocumentBody,
  MiniAppOcrUpdateBody,
  forbidden,
  notFound,
} from "./_shared";

const router: IRouter = Router();
router.post("/mini-app/clients/:id/documents", guestAuth, async (req, res) => {
  const clientId = Number(req.params.id);
  if (!(await verifyClientAccess(clientId, req.user!))) {
    forbidden(res, "Ruxsat yo'q");
    return;
  }
  const parsed = MiniAppDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    // SKIP(PR-E1.5): bespoke envelope uses `issues:` field (not `details:`)
    res.status(400).json({ error: "Некорректные данные / Noto'g'ri ma'lumot", issues: parsed.error.flatten() });
    return;
  }
  const { docType, fileName, storagePath, ocrText, extractedData } = parsed.data;
  // Format-validate the OCR-extracted fields (STIR, passport, phone) so the
  // UI can flag suspicious values for human review without dropping the raw
  // OCR output. The sanitized blob preserves originals when invalid.
  const validation = validateExtractedData(extractedData ?? null);
  const finalExtractedData = extractedData
    ? { ...validation.sanitized, _invalidFields: validation.invalidFields }
    : null;
  const [doc] = await db.insert(clientDocumentsTable).values({
    clientId,
    userId: req.user!.id,
    docType: docType || "other",
    fileName,
    storagePath,
    ocrText: ocrText ?? null,
    extractedData: finalExtractedData,
  }).returning();
  res.status(201).json(doc);
});


router.get("/mini-app/clients/:id/documents", guestAuth, async (req, res) => {
  const clientId = Number(req.params.id);
  if (!(await verifyClientAccess(clientId, req.user!))) {
    forbidden(res, "Ruxsat yo'q");
    return;
  }
  const docs = await db
    .select()
    .from(clientDocumentsTable)
    .where(eq(clientDocumentsTable.clientId, clientId))
    .orderBy(desc(clientDocumentsTable.createdAt));
  res.json(docs);
});


router.put("/mini-app/documents/:id/ocr", guestAuth, requireDocumentAccess, async (req, res) => {
  const docId = Number(req.params.id);
  const parsed = MiniAppOcrUpdateBody.safeParse(req.body);
  if (!parsed.success) {
    // SKIP(PR-E1.5): bespoke envelope uses `issues:` field (not `details:`)
    res.status(400).json({ error: "Некорректные данные / Noto'g'ri ma'lumot", issues: parsed.error.flatten() });
    return;
  }
  const { ocrText, extractedData } = parsed.data;
  const validation = validateExtractedData(extractedData ?? null);
  const finalExtractedData = extractedData
    ? { ...validation.sanitized, _invalidFields: validation.invalidFields }
    : null;
  const [updated] = await db
    .update(clientDocumentsTable)
    .set({
      ocrText: ocrText ?? null,
      extractedData: finalExtractedData,
    })
    .where(eq(clientDocumentsTable.id, docId))
    .returning();
  if (!updated) { notFound(res, "Hujjat topilmadi"); return; }
  res.json(updated);
});


router.delete("/mini-app/documents/:id", guestAuth, requireDocumentAccess, async (req, res) => {
  const docId = Number(req.params.id);
  const [deleted] = await db
    .delete(clientDocumentsTable)
    .where(eq(clientDocumentsTable.id, docId))
    .returning();
  if (!deleted) { notFound(res, "Hujjat topilmadi"); return; }
  res.json({ success: true });
});


export default router;
