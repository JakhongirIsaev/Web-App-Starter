import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { creditProductsTable } from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../middleware/activity";
import { upload, parseCsvBuffer } from "../lib/csv";

const router: IRouter = Router();

router.get("/credit-products", requireAuth, async (req, res) => {
  // Query params are typed as ParsedQs — destructuring with `as any` is
  // intentional since each field is individually validated below.
  const { search, segment, page = "1", pageSize = "50" } = req.query as any;
  // Drizzle condition array — `any[]` allows heterogeneous SQL conditions.
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
  if (!name) { res.status(400).json({ error: "Name required" }); return; }

  const [created] = await db.insert(creditProductsTable).values({
    number: num || null, name, sapCode: sapCode || null, segment: segment || null,
    disbursementForm: disbursementForm || null, loanAmount: loanAmount || null,
    termWorkingCapital: termWorkingCapital || null, termFixedAssets: termFixedAssets || null,
    termUntargeted: termUntargeted || null, rateUZS: rateUZS || null,
    rateUSD: rateUSD || null, rateEUR: rateEUR || null, gracePeriod: gracePeriod || null,
    purpose: purpose || null, highlight: highlight || null,
  }).returning();

  await logActivity({ type: "credit_product_created", description: `Credit product "${name}" created`, entityId: created.id, entityType: "credit_product", user: req.user });
  res.status(201).json(created);
});

router.put("/credit-products/:id", requireAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const updateData: Partial<typeof creditProductsTable.$inferInsert> = { updatedAt: new Date() };
  const allowedFields = ["name", "number", "sapCode", "segment", "disbursementForm", "loanAmount", "termWorkingCapital", "termFixedAssets", "termUntargeted", "rateUZS", "rateUSD", "rateEUR", "gracePeriod", "purpose", "highlight", "isActive"] as const;
  for (const f of allowedFields) {
    if (req.body[f] !== undefined) updateData[f] = req.body[f];
  }

  const [updated] = await db.update(creditProductsTable).set(updateData).where(eq(creditProductsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  await logActivity({ type: "credit_product_updated", description: `Credit product "${updated.name}" updated`, entityId: updated.id, entityType: "credit_product", user: req.user });
  res.json(updated);
});

router.delete("/credit-products/:id", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(creditProductsTable).where(eq(creditProductsTable.id, id));
  await logActivity({ type: "credit_product_deleted", description: `Credit product deleted`, entityId: id, entityType: "credit_product", user: req.user });
  res.status(204).send();
});

router.post("/credit-products/import", requireAuth, requireRole("superadmin", "head_office_admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const rows = parseCsvBuffer(req.file.buffer);
    const skipped: number[] = [];
    let imported = 0;
    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.name) { skipped.push(i + 2); continue; }
        await tx.insert(creditProductsTable).values({
          number: row.number ? Number(row.number) : null, name: row.name,
          sapCode: row.sapCode || null, segment: row.segment || null,
          disbursementForm: row.disbursementForm || null, loanAmount: row.loanAmount || null,
          termWorkingCapital: row.termWorkingCapital || null, termFixedAssets: row.termFixedAssets || null,
          termUntargeted: row.termUntargeted || null, rateUZS: row.rateUZS || null,
          rateUSD: row.rateUSD || null, rateEUR: row.rateEUR || null,
          gracePeriod: row.gracePeriod || null, purpose: row.purpose || null, highlight: row.highlight || null,
        });
        imported++;
      }
    });
    await logActivity({ type: "credit_products_imported", description: `Imported ${imported} credit products from CSV`, entityType: "credit_product", user: req.user });
    res.json({ imported, skipped });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
