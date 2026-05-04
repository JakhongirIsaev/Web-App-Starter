import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { creditLinesTable } from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";
import { z } from "zod";
import { guestAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../middleware/activity";
import { upload, parseCsvBuffer } from "../lib/csv";
import {
  isExcelUpload,
  mapCreditLineCsvRow,
  parseCreditLinesWorkbook,
} from "../lib/spreadsheet-import";
import { escapeLike } from "../lib/db-helpers";

const router: IRouter = Router();

// --- Zod schemas ---

const optionalString = z.union([z.string(), z.undefined()]).optional();
const optionalNumber = z.union([z.number(), z.string(), z.undefined()]).optional();

const createCreditLineSchema = z.object({
  name: z.string().min(1, "Название обязательно / Nomi majburiy"),
  number: optionalNumber,
  department: optionalString,
  agreementDate: optionalString,
  agreementAmount: optionalNumber,
  receivedAmount: optionalNumber,
  currency: optionalString,
  interestRate: optionalString,
  disbursedAmount: optionalNumber,
  remainingBalance: optionalNumber,
  projectCount: optionalNumber,
  specialConditions: optionalString,
  notes: optionalString,
  section: optionalString,
});

const updateCreditLineSchema = z.object({
  name: optionalString,
  number: optionalNumber,
  department: optionalString,
  agreementDate: optionalString,
  agreementAmount: optionalNumber,
  receivedAmount: optionalNumber,
  currency: optionalString,
  interestRate: optionalString,
  disbursedAmount: optionalNumber,
  remainingBalance: optionalNumber,
  projectCount: optionalNumber,
  specialConditions: optionalString,
  notes: optionalString,
  section: optionalString,
});

router.get("/credit-lines", guestAuth, async (req, res) => {
  const { search, section, currency, page = "1", pageSize = "50" } = req.query as any;
  const conditions: any[] = [];
  if (search) conditions.push(ilike(creditLinesTable.name, `%${escapeLike(String(search))}%`));
  if (section) conditions.push(eq(creditLinesTable.section, section));
  if (currency) conditions.push(eq(creditLinesTable.currency, currency));

  const pageNum = Math.max(1, Number(page));
  const limit = Math.min(100, Math.max(1, Number(pageSize)));
  const offset = (pageNum - 1) * limit;

  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(creditLinesTable).where(conditions.length > 0 ? and(...conditions) : undefined);
  const total = Number(countResult.count);

  const rows = await db.select().from(creditLinesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(creditLinesTable.number, creditLinesTable.id)
    .limit(limit).offset(offset);

  const mapped = rows.map(r => ({
    ...r,
    agreementAmount: r.agreementAmount !== null ? Number(r.agreementAmount) : null,
    receivedAmount: r.receivedAmount !== null ? Number(r.receivedAmount) : null,
    disbursedAmount: r.disbursedAmount !== null ? Number(r.disbursedAmount) : null,
    remainingBalance: r.remainingBalance !== null ? Number(r.remainingBalance) : null,
  }));

  res.json({ data: mapped, total, page: pageNum, pageSize: limit });
});

router.post("/credit-lines", guestAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const parsed = createCreditLineSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные данные / Noto'g'ri ma'lumot", issues: parsed.error.flatten() });
    return;
  }
  const { name, number: num, department, agreementDate, agreementAmount, receivedAmount, currency, interestRate, disbursedAmount, remainingBalance, projectCount, specialConditions, notes, section } = parsed.data;

  const [created] = await db.insert(creditLinesTable).values({
    number: num != null ? Number(num) : null, name, department: department || null,
    agreementDate: agreementDate || null,
    agreementAmount: agreementAmount != null ? String(agreementAmount) : null, receivedAmount: receivedAmount != null ? String(receivedAmount) : null,
    currency: currency || null, interestRate: interestRate || null,
    disbursedAmount: disbursedAmount != null ? String(disbursedAmount) : null, remainingBalance: remainingBalance != null ? String(remainingBalance) : null,
    projectCount: projectCount != null ? Number(projectCount) : null,
    specialConditions: specialConditions || null, notes: notes || null, section: section || null,
  }).returning();

  await logActivity({ type: "credit_line_created", description: `Kredit liniyasi "${name}" yaratildi`, entityId: created.id, entityType: "credit_line", user: req.user });
  res.status(201).json(created);
});

router.put("/credit-lines/:id", guestAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikатор" }); return; }

  const parsed = updateCreditLineSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные данные / Noto'g'ri ma'lumot", issues: parsed.error.flatten() });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  const data = parsed.data;
  const fields = ["name", "number", "department", "agreementDate", "agreementAmount", "receivedAmount", "currency", "interestRate", "disbursedAmount", "remainingBalance", "projectCount", "specialConditions", "notes", "section"] as const;
  for (const f of fields) {
    const val = data[f];
    if (val !== undefined) {
      if (["agreementAmount", "receivedAmount", "disbursedAmount", "remainingBalance"].includes(f)) {
        updateData[f] = val != null ? String(val) : null;
      } else if (f === "projectCount") {
        updateData[f] = val != null ? Number(val) : null;
      } else {
        updateData[f] = val;
      }
    }
  }

  const [updated] = await db.update(creditLinesTable).set(updateData).where(eq(creditLinesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Не найдено / Topilmadi" }); return; }

  await logActivity({ type: "credit_line_updated", description: `Kredit liniyasi "${updated.name}" yangilandi`, entityId: updated.id, entityType: "credit_line", user: req.user });
  res.json(updated);
});

router.delete("/credit-lines/:id", guestAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  await db.delete(creditLinesTable).where(eq(creditLinesTable.id, id));
  await logActivity({ type: "credit_line_deleted", description: "Кредитная линия удалена / Kredit liniyasi o'chirildi", entityId: id, entityType: "credit_line", user: req.user });
  res.status(204).send();
});

router.post("/credit-lines/import", guestAuth, requireRole("superadmin", "head_office_admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "Файл не загружен / Fayl yuklanmagan" }); return; }
    const sourceLabel = isExcelUpload(req.file) ? "таблица / jadval" : "текстовый файл / matnli fayl";
    const rows = isExcelUpload(req.file)
      ? parseCreditLinesWorkbook(req.file.buffer)
      : parseCsvBuffer(req.file.buffer).map(mapCreditLineCsvRow);
    const skipped: number[] = [];
    const validRows: Array<typeof creditLinesTable.$inferInsert> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.name) {
        skipped.push(i + 2);
        continue;
      }
      validRows.push({
        number: row.number !== null && row.number !== undefined ? Number(row.number) : null,
        name: row.name,
        department: row.department || null,
        agreementDate: row.agreementDate || null,
        agreementAmount: row.agreementAmount || null,
        receivedAmount: row.receivedAmount || null,
        currency: row.currency || null,
        interestRate: row.interestRate || null,
        disbursedAmount: row.disbursedAmount || null,
        remainingBalance: row.remainingBalance || null,
        projectCount: row.projectCount !== null && row.projectCount !== undefined ? Number(row.projectCount) : null,
        specialConditions: row.specialConditions || null,
        notes: row.notes || null,
        section: row.section || null,
      });
    }

    let cleared = 0;

    await db.transaction(async (tx) => {
      const [existingCountRow] = await tx.select({ count: sql<number>`count(*)` }).from(creditLinesTable);
      cleared = Number(existingCountRow?.count ?? 0);

      await tx.delete(creditLinesTable);

      if (validRows.length > 0) {
        await tx.insert(creditLinesTable).values(validRows);
      }
    });

    const imported = validRows.length;
    await logActivity({
      type: "credit_lines_imported",
      description: `Кредитные линии обновлены: ${imported} строк из ${sourceLabel}`,
      entityType: "credit_line",
      user: req.user,
    });
    res.json({ imported, cleared, replaced: true, skipped });
  } catch (err: any) {
    res.status(400).json({ error: "Импорт не выполнен / Import bajarilmadi" });
  }
});

export default router;
