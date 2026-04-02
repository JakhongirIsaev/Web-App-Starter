import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, branchesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  CreateUserBody, UpdateUserBody, GetUserParams, UpdateUserParams,
  DeleteUserParams, DeactivateUserParams, ActivateUserParams, ListUsersQueryParams
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../middleware/activity";
import { upload, parseCsvBuffer } from "../lib/csv";
import ExcelJS from "exceljs";

const router: IRouter = Router();

async function getUserWithBranch(id: number) {
  const rows = await db
    .select({
      id: usersTable.id,
      telegramId: usersTable.telegramId,
      name: usersTable.name,
      role: usersTable.role,
      branchId: usersTable.branchId,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
      branchName: branchesTable.name,
      branchCity: branchesTable.city,
      branchIsActive: branchesTable.isActive,
      branchCreatedAt: branchesTable.createdAt,
      branchUpdatedAt: branchesTable.updatedAt,
    })
    .from(usersTable)
    .leftJoin(branchesTable, eq(usersTable.branchId, branchesTable.id))
    .where(eq(usersTable.id, id))
    .limit(1);

  if (!rows.length) return null;
  const u = rows[0];
  return {
    id: u.id,
    telegramId: u.telegramId,
    name: u.name,
    role: u.role,
    branchId: u.branchId ?? null,
    branch: u.branchId ? {
      id: u.branchId,
      name: u.branchName!,
      city: u.branchCity!,
      isActive: u.branchIsActive!,
      createdAt: u.branchCreatedAt,
      updatedAt: u.branchUpdatedAt,
    } : null,
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

router.get("/users", requireAuth, requireRole("superadmin", "head_office_admin", "branch_head"), async (req, res) => {
  const user = req.user!;
  const params = ListUsersQueryParams.safeParse(req.query);
  const conditions: any[] = [];

  if (user.role === "branch_head" && user.branchId) {
    conditions.push(eq(usersTable.branchId, user.branchId));
  } else if (params.success && params.data.branchId !== undefined) {
    conditions.push(eq(usersTable.branchId, params.data.branchId));
  }

  if (params.success && params.data.isActive !== undefined) {
    conditions.push(eq(usersTable.isActive, params.data.isActive));
  }

  const rows = await db
    .select({
      id: usersTable.id,
      telegramId: usersTable.telegramId,
      name: usersTable.name,
      role: usersTable.role,
      branchId: usersTable.branchId,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
      branchName: branchesTable.name,
      branchCity: branchesTable.city,
      branchIsActive: branchesTable.isActive,
      branchCreatedAt: branchesTable.createdAt,
      branchUpdatedAt: branchesTable.updatedAt,
    })
    .from(usersTable)
    .leftJoin(branchesTable, eq(usersTable.branchId, branchesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(usersTable.name);

  const users = rows.map(u => ({
    id: u.id,
    telegramId: u.telegramId,
    name: u.name,
    role: u.role,
    branchId: u.branchId ?? null,
    branch: u.branchId ? {
      id: u.branchId,
      name: u.branchName!,
      city: u.branchCity!,
      isActive: u.branchIsActive!,
      createdAt: u.branchCreatedAt,
      updatedAt: u.branchUpdatedAt,
    } : null,
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));

  res.json(users);
});

router.get("/users/import-template", requireAuth, requireRole("superadmin", "head_office_admin"), async (_req, res) => {
  const branches = await db.select({ id: branchesTable.id, name: branchesTable.name, city: branchesTable.city }).from(branchesTable);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Пользователи");

  sheet.columns = [
    { header: "ФИО", key: "name", width: 30 },
    { header: "Telegram ID", key: "telegramId", width: 20 },
    { header: "Роль", key: "role", width: 20 },
    { header: "Филиал", key: "branch", width: 30 },
    { header: "Телефон", key: "phone", width: 20 },
  ];

  sheet.getRow(1).font = { bold: true };

  sheet.addRow({
    name: "Иванов Иван Иванович",
    telegramId: "123456789",
    role: "hunter",
    branch: branches[0]?.name || "Головной офис",
    phone: "+998901234567",
  });

  const rolesSheet = workbook.addWorksheet("Справочник");
  rolesSheet.columns = [
    { header: "Доступные роли", key: "role", width: 25 },
    { header: "Описание", key: "desc", width: 40 },
    { header: "Доступные филиалы", key: "branch", width: 30 },
  ];
  rolesSheet.getRow(1).font = { bold: true };

  const roleDescriptions = [
    { role: "superadmin", desc: "Суперадминистратор" },
    { role: "head_office_admin", desc: "Админ главного офиса" },
    { role: "editor", desc: "Редактор" },
    { role: "branch_head", desc: "Начальник филиала" },
    { role: "hunter", desc: "Кредитный эксперт" },
  ];

  roleDescriptions.forEach((r, i) => {
    rolesSheet.addRow({
      role: r.role,
      desc: r.desc,
      branch: branches[i]?.name || "",
    });
  });

  branches.forEach((b, i) => {
    if (i >= roleDescriptions.length) {
      rolesSheet.addRow({ role: "", desc: "", branch: b.name });
    }
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=import_template.xlsx");

  await workbook.xlsx.write(res);
  res.end();
});

router.post("/users/import", requireAuth, requireRole("superadmin", "head_office_admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

    const fileName = req.file.originalname || "";
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls") ||
      req.file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      req.file.mimetype === "application/vnd.ms-excel";

    let rows: Record<string, string>[] = [];

    if (isExcel) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) { res.status(400).json({ error: "Empty spreadsheet" }); return; }

      const headerRow = sheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell((cell, colNumber) => {
        const val = String(cell.value || "").trim().toLowerCase();
        const mapping: Record<string, string> = {
          "фио": "name", "имя": "name", "name": "name", "fullname": "name", "full name": "name",
          "telegram id": "telegramId", "telegramid": "telegramId", "telegram": "telegramId", "тг id": "telegramId",
          "роль": "role", "role": "role",
          "филиал": "branch", "branch": "branch", "отделение": "branch",
          "телефон": "phone", "phone": "phone", "тел": "phone",
        };
        headers[colNumber] = mapping[val] || val;
      });

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const obj: Record<string, string> = {};
        let hasData = false;
        row.eachCell((cell, colNumber) => {
          const key = headers[colNumber];
          if (key) {
            const cellVal = String(cell.value || "").trim();
            if (cellVal) hasData = true;
            obj[key] = cellVal;
          }
        });
        if (hasData) rows.push(obj);
      });
    } else {
      rows = parseCsvBuffer(req.file.buffer);
    }

    const branches = await db.select({ id: branchesTable.id, name: branchesTable.name }).from(branchesTable);
    const branchMap = new Map<string, number>();
    branches.forEach(b => {
      branchMap.set(b.name.toLowerCase(), b.id);
      branchMap.set(b.name, b.id);
    });

    const existingUsers = await db.select({ telegramId: usersTable.telegramId }).from(usersTable);
    const existingIds = new Set(existingUsers.map(u => u.telegramId));

    const validRoles = ["superadmin", "head_office_admin", "editor", "branch_head", "hunter"];
    const created: { name: string; telegramId: string; role: string; branch: string; password: string }[] = [];
    const skipped: { row: number; name: string; reason: string }[] = [];

    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = row.name || row["фио"] || row["имя"] || "";
        const telegramId = row.telegramId || row["telegram id"] || row["telegram"] || "";
        const roleRaw = row.role || row["роль"] || "";
        const branchRaw = row.branch || row["филиал"] || "";

        if (!name.trim()) { skipped.push({ row: i + 2, name: name || "—", reason: "Не указано ФИО" }); continue; }
        if (!telegramId.trim()) { skipped.push({ row: i + 2, name, reason: "Не указан Telegram ID" }); continue; }
        if (existingIds.has(telegramId.trim())) { skipped.push({ row: i + 2, name, reason: "Telegram ID уже существует" }); continue; }

        const role = validRoles.includes(roleRaw.trim().toLowerCase()) ? roleRaw.trim().toLowerCase() : "hunter";

        let branchId: number | null = null;
        if (branchRaw.trim()) {
          const found = branchMap.get(branchRaw.trim().toLowerCase()) || branchMap.get(branchRaw.trim());
          if (found) branchId = found;
          else { skipped.push({ row: i + 2, name, reason: `Филиал "${branchRaw}" не найден` }); continue; }
        }

        const password = Math.random().toString(36).substring(2, 10);
        const passwordHash = await bcrypt.hash(password, 10);

        await tx.insert(usersTable).values({
          telegramId: telegramId.trim(),
          name: name.trim(),
          role: role as any,
          branchId,
          passwordHash,
          isActive: true,
        });

        existingIds.add(telegramId.trim());
        created.push({
          name: name.trim(),
          telegramId: telegramId.trim(),
          role,
          branch: branchRaw.trim(),
          password,
        });
      }
    });

    await logActivity({ type: "users_imported", description: `Imported ${created.length} users (${skipped.length} skipped)`, entityType: "user", user: req.user });
    res.json({ imported: created.length, skipped, created });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/users", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const [user] = await db.insert(usersTable).values({
    telegramId: parsed.data.telegramId,
    name: parsed.data.name,
    role: parsed.data.role,
    branchId: parsed.data.branchId ?? null,
    passwordHash,
    isActive: true,
  }).returning();

  await logActivity({ type: "user_created", description: `User "${user.name}" created with role ${user.role}`, entityId: user.id, entityType: "user", user: req.user });

  const full = await getUserWithBranch(user.id);
  res.status(201).json(full);
});

router.get("/users/:id", requireAuth, requireRole("superadmin", "head_office_admin", "branch_head"), async (req, res) => {
  const params = GetUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = await getUserWithBranch(params.data.id);
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(user);
});

router.put("/users/:id", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = UpdateUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const updateData: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
  if (parsed.data.branchId !== undefined) updateData.branchId = parsed.data.branchId;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
  if (parsed.data.password !== undefined) {
    updateData.passwordHash = await bcrypt.hash(parsed.data.password, 10);
  }

  const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  await logActivity({ type: "user_updated", description: `User "${updated.name}" updated`, entityId: updated.id, entityType: "user", user: req.user });

  const full = await getUserWithBranch(updated.id);
  res.json(full);
});

router.delete("/users/:id", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = DeleteUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(usersTable).where(eq(usersTable.id, params.data.id));

  await logActivity({ type: "user_deleted", description: `User deleted`, entityId: params.data.id, entityType: "user", user: req.user });

  res.status(204).send();
});

router.post("/users/:id/deactivate", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = DeactivateUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [updated] = await db.update(usersTable).set({ isActive: false, updatedAt: new Date() }).where(eq(usersTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  await logActivity({ type: "user_deactivated", description: `User "${updated.name}" deactivated`, entityId: updated.id, entityType: "user", user: req.user });

  const full = await getUserWithBranch(updated.id);
  res.json(full);
});

router.post("/users/:id/activate", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = ActivateUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [updated] = await db.update(usersTable).set({ isActive: true, updatedAt: new Date() }).where(eq(usersTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  await logActivity({ type: "user_activated", description: `User "${updated.name}" activated`, entityId: updated.id, entityType: "user", user: req.user });

  const full = await getUserWithBranch(updated.id);
  res.json(full);
});

export default router;
