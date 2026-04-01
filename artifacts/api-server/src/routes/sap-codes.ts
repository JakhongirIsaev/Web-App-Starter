import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sapCodesTable } from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../middleware/activity";
import { upload, parseCsvBuffer } from "../lib/csv";

const router: IRouter = Router();

router.get("/sap-codes", requireAuth, async (req, res) => {
  const { search, status, page = "1", pageSize = "50" } = req.query as any;
  const conditions: any[] = [];
  if (search) conditions.push(ilike(sapCodesTable.name, `%${search}%`));
  if (status) conditions.push(eq(sapCodesTable.status, status));

  const pageNum = Math.max(1, Number(page));
  const limit = Math.min(200, Math.max(1, Number(pageSize)));
  const offset = (pageNum - 1) * limit;

  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(sapCodesTable).where(conditions.length > 0 ? and(...conditions) : undefined);
  const total = Number(countResult.count);

  const rows = await db.select().from(sapCodesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sapCodesTable.productId)
    .limit(limit).offset(offset);

  res.json({ data: rows, total, page: pageNum, pageSize: limit });
});

router.post("/sap-codes", requireAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const { status, productId, name, productType, categoryId, categoryName } = req.body;
  if (!name || !status) { res.status(400).json({ error: "Name and status required" }); return; }

  const [created] = await db.insert(sapCodesTable).values({
    status, productId: productId || null, name,
    productType: productType || null, categoryId: categoryId || null,
    categoryName: categoryName || null,
  }).returning();

  await logActivity({ type: "sap_code_created", description: `SAP code "${productId || name}" created`, entityId: created.id, entityType: "sap_code", user: req.user });
  res.status(201).json(created);
});

router.put("/sap-codes/:id", requireAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const updateData: any = { updatedAt: new Date() };
  const fields = ["status", "productId", "name", "productType", "categoryId", "categoryName"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updateData[f] = req.body[f];
  }

  const [updated] = await db.update(sapCodesTable).set(updateData).where(eq(sapCodesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  await logActivity({ type: "sap_code_updated", description: `SAP code "${updated.productId || updated.name}" updated`, entityId: updated.id, entityType: "sap_code", user: req.user });
  res.json(updated);
});

router.delete("/sap-codes/:id", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(sapCodesTable).where(eq(sapCodesTable.id, id));
  await logActivity({ type: "sap_code_deleted", description: `SAP code deleted`, entityId: id, entityType: "sap_code", user: req.user });
  res.status(204).send();
});

router.post("/sap-codes/import", requireAuth, requireRole("superadmin", "head_office_admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const rows = parseCsvBuffer(req.file.buffer);
    const skipped: number[] = [];
    let imported = 0;
    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.name || !row.status) { skipped.push(i + 2); continue; }
        await tx.insert(sapCodesTable).values({
          status: row.status, productId: row.productId || null, name: row.name,
          productType: row.productType || null, categoryId: row.categoryId || null,
          categoryName: row.categoryName || null,
        });
        imported++;
      }
    });
    await logActivity({ type: "sap_codes_imported", description: `Imported ${imported} SAP codes from CSV`, entityType: "sap_code", user: req.user });
    res.json({ imported, skipped });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
