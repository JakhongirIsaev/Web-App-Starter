import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateBranchBody, UpdateBranchBody, GetBranchParams, UpdateBranchParams, DeleteBranchParams } from "@workspace/api-zod";
import { guestAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../middleware/activity";
import { upload, parseCsvBuffer } from "../lib/csv";

const router: IRouter = Router();

router.get("/branches", guestAuth, async (_req, res) => {
  const branches = await db.select().from(branchesTable).orderBy(branchesTable.name);
  res.json(branches);
});

router.post("/branches", guestAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
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

router.get("/branches/:id", guestAuth, async (req, res) => {
  const params = GetBranchParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, params.data.id)).limit(1);
  if (!branch) { res.status(404).json({ error: "Не найдено / Topilmadi" }); return; }
  res.json(branch);
});

router.put("/branches/:id", guestAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
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

router.delete("/branches/:id", guestAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = DeleteBranchParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  await db.delete(branchesTable).where(eq(branchesTable.id, params.data.id));

  await logActivity({ type: "branch_deleted", description: "Филиал удален / Filial o'chirildi", entityId: params.data.id, entityType: "branch", user: req.user });

  res.status(204).send();
});

// Dry-run + commit. ?dryRun=1 validates without writing; returns per-row
// status so the admin UI can preview before committing.
router.post(
  "/branches/import",
  guestAuth,
  requireRole("superadmin", "head_office_admin"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Файл не загружен / Fayl yuklanmagan" });
        return;
      }
      const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
      const rows = parseCsvBuffer(req.file.buffer);

      type RowResult = {
        rowNumber: number;
        ok: boolean;
        error?: string;
        name?: string;
        city?: string;
        isActive?: boolean;
      };

      const results: RowResult[] = rows.map((row, i) => {
        const rowNumber = i + 2;
        if (!row.name) return { rowNumber, ok: false, error: "name missing" };
        if (!row.city) return { rowNumber, ok: false, error: "city missing" };
        return {
          rowNumber,
          ok: true,
          name: row.name,
          city: row.city,
          isActive: row.isActive !== "false",
        };
      });

      const valid = results.filter((r) => r.ok);
      const skipped = results.filter((r) => !r.ok);

      if (dryRun) {
        res.json({
          dryRun: true,
          total: results.length,
          willImport: valid.length,
          willSkip: skipped.length,
          rows: results,
        });
        return;
      }

      let imported = 0;
      await db.transaction(async (tx) => {
        for (const row of valid) {
          await tx.insert(branchesTable).values({
            name: row.name!,
            city: row.city!,
            isActive: row.isActive ?? true,
          });
          imported++;
        }
      });

      await logActivity({
        type: "branches_imported",
        description: `Импортировано филиалов: ${imported} / Import qilingan filiallar: ${imported}`,
        entityType: "branch",
        user: req.user,
        metadata: {
          imported,
          skipped: skipped.length,
          skippedRows: skipped.map((r) => ({ rowNumber: r.rowNumber, error: r.error })),
        },
      });

      res.json({
        dryRun: false,
        total: results.length,
        imported,
        skipped: skipped.map((r) => r.rowNumber),
      });
    } catch {
      res.status(400).json({ error: "Импорт не выполнен / Import bajarilmadi" });
    }
  },
);

export default router;
