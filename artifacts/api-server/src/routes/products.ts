import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { productsTable, productCategoriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateProductBody, UpdateProductBody, GetProductParams,
  UpdateProductParams, DeleteProductParams, ListProductsQueryParams,
  CreateProductCategoryBody
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../middleware/activity";
import { upload, parseCsvBuffer } from "../lib/csv";

const router: IRouter = Router();

function buildProductResponse(p: any, cat: any) {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    categoryId: p.categoryId ?? null,
    category: cat ?? null,
    description: p.description ?? null,
    minAmount: p.minAmount !== null ? Number(p.minAmount) : null,
    maxAmount: p.maxAmount !== null ? Number(p.maxAmount) : null,
    minTermMonths: p.minTermMonths ?? null,
    maxTermMonths: p.maxTermMonths ?? null,
    interestRate: p.interestRate !== null ? Number(p.interestRate) : null,
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

router.get("/product-categories", requireAuth, async (_req, res) => {
  const cats = await db.select().from(productCategoriesTable).orderBy(productCategoriesTable.name);
  res.json(cats);
});

router.post("/product-categories", requireAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const parsed = CreateProductCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [cat] = await db.insert(productCategoriesTable).values({
    name: parsed.data.name,
    description: parsed.data.description,
  }).returning();

  await logActivity({ type: "category_created", description: `Product category "${cat.name}" created`, entityId: cat.id, entityType: "product_category", user: req.user });

  res.status(201).json(cat);
});

router.get("/products", requireAuth, async (req, res) => {
  const params = ListProductsQueryParams.safeParse(req.query);
  const conditions: any[] = [];
  if (params.success) {
    if (params.data.categoryId !== undefined) conditions.push(eq(productsTable.categoryId, params.data.categoryId));
    if (params.data.isActive !== undefined) conditions.push(eq(productsTable.isActive, params.data.isActive));
    if (params.data.type !== undefined) conditions.push(eq(productsTable.type, params.data.type as any));
  }

  const rows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      type: productsTable.type,
      categoryId: productsTable.categoryId,
      description: productsTable.description,
      minAmount: productsTable.minAmount,
      maxAmount: productsTable.maxAmount,
      minTermMonths: productsTable.minTermMonths,
      maxTermMonths: productsTable.maxTermMonths,
      interestRate: productsTable.interestRate,
      isActive: productsTable.isActive,
      createdAt: productsTable.createdAt,
      updatedAt: productsTable.updatedAt,
      catId: productCategoriesTable.id,
      catName: productCategoriesTable.name,
      catDescription: productCategoriesTable.description,
      catCreatedAt: productCategoriesTable.createdAt,
    })
    .from(productsTable)
    .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(productsTable.name);

  const products = rows.map(p => buildProductResponse(p,
    p.catId ? { id: p.catId, name: p.catName, description: p.catDescription ?? null, createdAt: p.catCreatedAt } : null
  ));
  res.json(products);
});

router.post("/products", requireAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [product] = await db.insert(productsTable).values({
    name: parsed.data.name,
    type: parsed.data.type,
    categoryId: parsed.data.categoryId ?? null,
    description: parsed.data.description ?? null,
    minAmount: parsed.data.minAmount?.toString() ?? null,
    maxAmount: parsed.data.maxAmount?.toString() ?? null,
    minTermMonths: parsed.data.minTermMonths ?? null,
    maxTermMonths: parsed.data.maxTermMonths ?? null,
    interestRate: parsed.data.interestRate?.toString() ?? null,
    isActive: parsed.data.isActive ?? true,
  }).returning();

  await logActivity({ type: "product_created", description: `Product "${product.name}" created`, entityId: product.id, entityType: "product", user: req.user });

  res.status(201).json(buildProductResponse(product, null));
});

router.get("/products/:id", requireAuth, async (req, res) => {
  const params = GetProductParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      type: productsTable.type,
      categoryId: productsTable.categoryId,
      description: productsTable.description,
      minAmount: productsTable.minAmount,
      maxAmount: productsTable.maxAmount,
      minTermMonths: productsTable.minTermMonths,
      maxTermMonths: productsTable.maxTermMonths,
      interestRate: productsTable.interestRate,
      isActive: productsTable.isActive,
      createdAt: productsTable.createdAt,
      updatedAt: productsTable.updatedAt,
      catId: productCategoriesTable.id,
      catName: productCategoriesTable.name,
      catDescription: productCategoriesTable.description,
      catCreatedAt: productCategoriesTable.createdAt,
    })
    .from(productsTable)
    .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id))
    .where(eq(productsTable.id, params.data.id))
    .limit(1);
  if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
  const p = rows[0];
  res.json(buildProductResponse(p, p.catId ? { id: p.catId, name: p.catName, description: p.catDescription ?? null, createdAt: p.catCreatedAt } : null));
});

router.put("/products/:id", requireAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const params = UpdateProductParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const updateData: any = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.type !== undefined) updateData.type = parsed.data.type;
  if (parsed.data.categoryId !== undefined) updateData.categoryId = parsed.data.categoryId;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.minAmount !== undefined) updateData.minAmount = parsed.data.minAmount?.toString();
  if (parsed.data.maxAmount !== undefined) updateData.maxAmount = parsed.data.maxAmount?.toString();
  if (parsed.data.minTermMonths !== undefined) updateData.minTermMonths = parsed.data.minTermMonths;
  if (parsed.data.maxTermMonths !== undefined) updateData.maxTermMonths = parsed.data.maxTermMonths;
  if (parsed.data.interestRate !== undefined) updateData.interestRate = parsed.data.interestRate?.toString();
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;

  const [updated] = await db.update(productsTable).set(updateData).where(eq(productsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  await logActivity({ type: "product_updated", description: `Product "${updated.name}" updated`, entityId: updated.id, entityType: "product", user: req.user });

  res.json(buildProductResponse(updated, null));
});

router.delete("/products/:id", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = DeleteProductParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(productsTable).where(eq(productsTable.id, params.data.id));

  await logActivity({ type: "product_deleted", description: `Product deleted`, entityId: params.data.id, entityType: "product", user: req.user });

  res.status(204).send();
});

router.post("/products/import", requireAuth, requireRole("superadmin", "head_office_admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const rows = parseCsvBuffer(req.file.buffer);
    const skipped: number[] = [];
    let imported = 0;
    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.name) { skipped.push(i + 2); continue; }
        await tx.insert(productsTable).values({
          name: row.name,
          type: row.type === "non_credit" ? "non_credit" : "credit",
          description: row.description || null,
          minAmount: row.minAmount || null,
          maxAmount: row.maxAmount || null,
          minTermMonths: row.minTermMonths ? Number(row.minTermMonths) : null,
          maxTermMonths: row.maxTermMonths ? Number(row.maxTermMonths) : null,
          interestRate: row.interestRate || null,
          isActive: row.isActive !== "false",
        });
        imported++;
      }
    });
    await logActivity({ type: "products_imported", description: `Imported ${imported} products from CSV`, entityType: "product", user: req.user });
    res.json({ imported, skipped });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
