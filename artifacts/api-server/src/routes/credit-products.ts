import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { basketItemsTable, creditProductsTable } from "@workspace/db";
import { eq, ilike, and, isNotNull, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../middleware/activity";
import { upload, parseCsvBuffer } from "../lib/csv";
import {
  isExcelUpload,
  mapCreditProductCsvRow,
  parseCreditProductsWorkbook,
} from "../lib/spreadsheet-import";

const router: IRouter = Router();

router.get("/credit-products", requireAuth, async (req, res) => {
  const { search, segment, page = "1", pageSize = "50" } = req.query as any;
  const conditions: any[] = [];
  if (search) conditions.push(ilike(creditProductsTable.name, `%${search}%`));
  if (segment) conditions.push(eq(creditProductsTable.segment, segment));

  const pageNum = Math.max(1, Number(page));
  const limit = Math.min(100, Math.max(1, Number(pageSize)));
  const offset = (pageNum - 1) * limit;

  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(creditProductsTable).where(conditions.length > 0 ? and(...conditions) : undefined);
  const total = Number(countResult.count);

  const rows = await db.select().from(creditProductsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(creditProductsTable.number, creditProductsTable.id)
    .limit(limit).offset(offset);

  res.json({ data: rows, total, page: pageNum, pageSize: limit });
});

router.post("/credit-products", requireAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const { name, number: num, sapCode, segment, disbursementForm, loanAmount, termWorkingCapital, termFixedAssets, termUntargeted, rateUZS, rateUSD, rateEUR, gracePeriod, purpose, highlight } = req.body;
  if (!name) { res.status(400).json({ error: "Название обязательно / Nomi majburiy" }); return; }

  const [created] = await db.insert(creditProductsTable).values({
    number: num || null, name, sapCode: sapCode || null, segment: segment || null,
    disbursementForm: disbursementForm || null, loanAmount: loanAmount || null,
    termWorkingCapital: termWorkingCapital || null, termFixedAssets: termFixedAssets || null,
    termUntargeted: termUntargeted || null, rateUZS: rateUZS || null,
    rateUSD: rateUSD || null, rateEUR: rateEUR || null, gracePeriod: gracePeriod || null,
    purpose: purpose || null, highlight: highlight || null,
  }).returning();

  await logActivity({ type: "credit_product_created", description: `Kredit mahsuloti "${name}" yaratildi`, entityId: created.id, entityType: "credit_product", user: req.user });
  res.status(201).json(created);
});

router.put("/credit-products/:id", requireAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }

  const updateData: any = { updatedAt: new Date() };
  const fields = ["name", "number", "sapCode", "segment", "disbursementForm", "loanAmount", "termWorkingCapital", "termFixedAssets", "termUntargeted", "rateUZS", "rateUSD", "rateEUR", "gracePeriod", "purpose", "highlight", "isActive"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updateData[f] = req.body[f];
  }

  const [updated] = await db.update(creditProductsTable).set(updateData).where(eq(creditProductsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Не найдено / Topilmadi" }); return; }

  await logActivity({ type: "credit_product_updated", description: `Kredit mahsuloti "${updated.name}" yangilandi`, entityId: updated.id, entityType: "credit_product", user: req.user });
  res.json(updated);
});

router.delete("/credit-products/:id", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  await db.delete(creditProductsTable).where(eq(creditProductsTable.id, id));
  await logActivity({ type: "credit_product_deleted", description: "Кредитный продукт удален / Kredit mahsuloti o'chirildi", entityId: id, entityType: "credit_product", user: req.user });
  res.status(204).send();
});

router.post("/credit-products/import", requireAuth, requireRole("superadmin", "head_office_admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "Файл не загружен / Fayl yuklanmagan" }); return; }
    const sourceLabel = isExcelUpload(req.file) ? "таблица / jadval" : "текстовый файл / matnli fayl";
    const rows = isExcelUpload(req.file)
      ? parseCreditProductsWorkbook(req.file.buffer)
      : parseCsvBuffer(req.file.buffer).map(mapCreditProductCsvRow);
    const skipped: number[] = [];
    const validRows: Array<typeof creditProductsTable.$inferInsert> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.name) {
        skipped.push(i + 2);
        continue;
      }
      validRows.push({
        number: row.number !== null && row.number !== undefined ? Number(row.number) : null,
        name: row.name,
        sapCode: row.sapCode || null,
        segment: row.segment || null,
        disbursementForm: row.disbursementForm || null,
        loanAmount: row.loanAmount || null,
        termWorkingCapital: row.termWorkingCapital || null,
        termFixedAssets: row.termFixedAssets || null,
        termUntargeted: row.termUntargeted || null,
        rateUZS: row.rateUZS || null,
        rateUSD: row.rateUSD || null,
        rateEUR: row.rateEUR || null,
        gracePeriod: row.gracePeriod || null,
        purpose: row.purpose || null,
        highlight: row.highlight || null,
      });
    }

    let detachedBasketItems = 0;
    let cleared = 0;

    await db.transaction(async (tx) => {
      const [existingCountRow] = await tx.select({ count: sql<number>`count(*)` }).from(creditProductsTable);
      cleared = Number(existingCountRow?.count ?? 0);

      const [linkedBasketCountRow] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(basketItemsTable)
        .where(isNotNull(basketItemsTable.productId));
      detachedBasketItems = Number(linkedBasketCountRow?.count ?? 0);

      if (detachedBasketItems > 0) {
        await tx
          .update(basketItemsTable)
          .set({ productId: null })
          .where(isNotNull(basketItemsTable.productId));
      }

      await tx.delete(creditProductsTable);

      if (validRows.length > 0) {
        await tx.insert(creditProductsTable).values(validRows);
      }
    });

    const imported = validRows.length;
    await logActivity({
      type: "credit_products_imported",
      description: `Кредитные продукты обновлены: ${imported} строк из ${sourceLabel}`,
      entityType: "credit_product",
      user: req.user,
    });
    res.json({ imported, cleared, detachedBasketItems, replaced: true, skipped });
  } catch (err: any) {
    res.status(400).json({ error: "Импорт не выполнен / Import bajarilmadi" });
  }
});

export default router;
