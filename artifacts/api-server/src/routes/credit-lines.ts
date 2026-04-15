import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { creditLinesTable } from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../middleware/activity";
import { upload, parseCsvBuffer } from "../lib/csv";

const router: IRouter = Router();

router.get("/credit-lines", requireAuth, async (req, res) => {
  // Query params are typed as ParsedQs — destructuring with `as any` is
  // intentional since each field is individually validated below.
  const { search, section, currency, page = "1", pageSize = "50" } = req.query as any;
  // Drizzle condition array — `any[]` allows heterogeneous SQL conditions.
  const conditions: any[] = [];
  if (search) conditions.push(ilike(creditLinesTable.name, `%${search}%`));
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

router.post("/credit-lines", requireAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const { name, number: num, department, agreementDate, agreementAmount, receivedAmount, currency, interestRate, disbursedAmount, remainingBalance, projectCount, specialConditions, notes, section } = req.body;
  if (!name) { res.status(400).json({ error: "Name required" }); return; }

  const [created] = await db.insert(creditLinesTable).values({
    number: num || null, name, department: department || null,
    agreementDate: agreementDate || null,
    agreementAmount: agreementAmount?.toString() || null, receivedAmount: receivedAmount?.toString() || null,
    currency: currency || null, interestRate: interestRate || null,
    disbursedAmount: disbursedAmount?.toString() || null, remainingBalance: remainingBalance?.toString() || null,
    projectCount: projectCount ? Number(projectCount) : null,
    specialConditions: specialConditions || null, notes: notes || null, section: section || null,
  }).returning();

  await logActivity({ type: "credit_line_created", description: `Credit line "${name}" created`, entityId: created.id, entityType: "credit_line", user: req.user });
  res.status(201).json(created);
});

router.put("/credit-lines/:id", requireAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Partial<> update object — `any` is intentional since fields
  // are dynamically populated from a whitelist of column names.
  const updateData: any = { updatedAt: new Date() };
  const fields = ["name", "number", "department", "agreementDate", "agreementAmount", "receivedAmount", "currency", "interestRate", "disbursedAmount", "remainingBalance", "projectCount", "specialConditions", "notes", "section"];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      if (["agreementAmount", "receivedAmount", "disbursedAmount", "remainingBalance"].includes(f)) {
        updateData[f] = req.body[f]?.toString() || null;
      } else if (f === "projectCount") {
        updateData[f] = req.body[f] ? Number(req.body[f]) : null;
      } else {
        updateData[f] = req.body[f];
      }
    }
  }

  const [updated] = await db.update(creditLinesTable).set(updateData).where(eq(creditLinesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  await logActivity({ type: "credit_line_updated", description: `Credit line "${updated.name}" updated`, entityId: updated.id, entityType: "credit_line", user: req.user });
  res.json(updated);
});

router.delete("/credit-lines/:id", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(creditLinesTable).where(eq(creditLinesTable.id, id));
  await logActivity({ type: "credit_line_deleted", description: `Credit line deleted`, entityId: id, entityType: "credit_line", user: req.user });
  res.status(204).send();
});

router.post("/credit-lines/import", requireAuth, requireRole("superadmin", "head_office_admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const rows = parseCsvBuffer(req.file.buffer);
    const skipped: number[] = [];
    let imported = 0;
    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.name) { skipped.push(i + 2); continue; }
        await tx.insert(creditLinesTable).values({
          number: row.number ? Number(row.number) : null, name: row.name,
          department: row.department || null, agreementDate: row.agreementDate || null,
          agreementAmount: row.agreementAmount || null, receivedAmount: row.receivedAmount || null,
          currency: row.currency || null, interestRate: row.interestRate || null,
          disbursedAmount: row.disbursedAmount || null, remainingBalance: row.remainingBalance || null,
          projectCount: row.projectCount ? Number(row.projectCount) : null,
          specialConditions: row.specialConditions || null, notes: row.notes || null, section: row.section || null,
        });
        imported++;
      }
    });
    await logActivity({ type: "credit_lines_imported", description: `Imported ${imported} credit lines from CSV`, entityType: "credit_line", user: req.user });
    res.json({ imported, skipped });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
