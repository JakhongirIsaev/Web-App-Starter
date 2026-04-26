import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateBranchBody, UpdateBranchBody, GetBranchParams, UpdateBranchParams, DeleteBranchParams } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../middleware/activity";
import { upload, parseCsvBuffer } from "../lib/csv";

const router: IRouter = Router();

router.get("/branches", requireAuth, async (_req, res) => {
  const branches = await db.select().from(branchesTable).orderBy(branchesTable.name);
  res.json(branches);
});

router.post("/branches", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const parsed = CreateBranchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Некорректные данные / Noto'g'ri ma'lumot" }); return; }
  const [branch] = await db.insert(branchesTable).values({
    name: parsed.data.name,
    city: parsed.data.city,
    isActive: parsed.data.isActive ?? true,
  }).returning();

  await logActivity({ type: "branch_created", description: `Filial "${branch.name}" yaratildi`, entityId: branch.id, entityType: "branch", user: req.user });

  res.status(201).json(branch);
});

router.get("/branches/:id", requireAuth, async (req, res) => {
  const params = GetBranchParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, params.data.id)).limit(1);
  if (!branch) { res.status(404).json({ error: "Не найдено / Topilmadi" }); return; }
  res.json(branch);
});

router.put("/branches/:id", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = UpdateBranchParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  const parsed = UpdateBranchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Некорректные данные / Noto'g'ri ma'lumot" }); return; }

  const updateData: Partial<typeof branchesTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.city !== undefined) updateData.city = parsed.data.city;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;

  const [updated] = await db.update(branchesTable).set(updateData).where(eq(branchesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Не найдено / Topilmadi" }); return; }

  await logActivity({ type: "branch_updated", description: `Filial "${updated.name}" yangilandi`, entityId: updated.id, entityType: "branch", user: req.user });

  res.json(updated);
});

router.delete("/branches/:id", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = DeleteBranchParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  await db.delete(branchesTable).where(eq(branchesTable.id, params.data.id));

  await logActivity({ type: "branch_deleted", description: "Филиал удален / Filial o'chirildi", entityId: params.data.id, entityType: "branch", user: req.user });

  res.status(204).send();
});

router.post("/branches/import", requireAuth, requireRole("superadmin", "head_office_admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "Файл не загружен / Fayl yuklanmagan" }); return; }
    const rows = parseCsvBuffer(req.file.buffer);
    const skipped: number[] = [];
    let imported = 0;
    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.name || !row.city) { skipped.push(i + 2); continue; }
        await tx.insert(branchesTable).values({
          name: row.name,
          city: row.city,
          isActive: row.isActive !== "false",
        });
        imported++;
      }
    });
    await logActivity({ type: "branches_imported", description: `Импортировано филиалов: ${imported} / Import qilingan filiallar: ${imported}`, entityType: "branch", user: req.user });
    res.json({ imported, skipped });
  } catch (err: any) {
    res.status(400).json({ error: "Импорт не выполнен / Import bajarilmadi" });
  }
});

export default router;
