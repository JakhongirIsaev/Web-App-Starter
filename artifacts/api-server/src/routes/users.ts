import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, branchesTable, rolesEnum } from "@workspace/db";
import type { UserRole } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import XLSX from "xlsx";
import crypto from "crypto";
import {
  CreateUserBody, UpdateUserBody, GetUserParams, UpdateUserParams,
  DeleteUserParams, DeactivateUserParams, ActivateUserParams, ListUsersQueryParams
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../middleware/activity";
import { upload, parseCsvBuffer } from "../lib/csv";

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

router.get("/users/import-template", requireAuth, requireRole("superadmin", "head_office_admin"), (req, res) => {
  const templateData = [
    {
      "ФИО": "Иванов Иван Иванович",
      "Telegram ID": "100000001",
      "Роль": "branch_head",
      "Филиал": "Главный офис",
      "Телефон": "+998901234567",
    },
    {
      "ФИО": "Петров Пётр Петрович",
      "Telegram ID": "100000002",
      "Роль": "hunter",
      "Филиал": "Ташкент",
      "Телефон": "+998907654321",
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(templateData);

  const colWidths = [
    { wch: 30 },
    { wch: 15 },
    { wch: 20 },
    { wch: 25 },
    { wch: 18 },
  ];
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, "Users");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="users_import_template.xlsx"');
  res.send(Buffer.from(buffer));
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

function generatePassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

const VALID_ROLES: readonly string[] = rolesEnum;

const ROLE_ALIASES: Record<string, string> = {
  "суперадмин": "superadmin",
  "superadmin": "superadmin",
  "админ главного офиса": "head_office_admin",
  "head_office_admin": "head_office_admin",
  "bosh ofis admini": "head_office_admin",
  "редактор": "editor",
  "editor": "editor",
  "muharrir": "editor",
  "начальник филиала": "branch_head",
  "branch_head": "branch_head",
  "filial boshlig'i": "branch_head",
  "кредитный эксперт": "hunter",
  "hunter": "hunter",
  "kredit eksperti": "hunter",
};

function resolveRole(input: string): UserRole {
  const normalized = input.trim().toLowerCase();
  const resolved = ROLE_ALIASES[normalized] || (VALID_ROLES.includes(normalized) ? normalized : "branch_head");
  return resolved as UserRole;
}

function parseExcelBuffer(buffer: Buffer): Record<string, string>[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const jsonData: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return jsonData.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key.trim()] = String(value ?? "").trim();
    }
    return normalized;
  });
}

const COLUMN_MAP: Record<string, string> = {
  "фио": "name",
  "ф.и.о.": "name",
  "ф.и.о": "name",
  "имя": "name",
  "name": "name",
  "ism": "name",
  "to'liq ism": "name",
  "telegram id": "telegramId",
  "telegram_id": "telegramId",
  "telegramid": "telegramId",
  "роль": "role",
  "role": "role",
  "rol": "role",
  "филиал": "branch",
  "branch": "branch",
  "filial": "branch",
  "телефон": "phone",
  "phone": "phone",
  "telefon": "phone",
  "пароль": "password",
  "password": "password",
  "parol": "password",
};

function normalizeRow(raw: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalized = COLUMN_MAP[key.toLowerCase().trim()];
    if (normalized) {
      result[normalized] = value;
    }
  }
  return result;
}

router.post("/users/import", requireAuth, requireRole("superadmin", "head_office_admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

    const fileName = req.file.originalname || "";
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls") ||
      req.file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      req.file.mimetype === "application/vnd.ms-excel";

    let rawRows: Record<string, string>[];
    if (isExcel) {
      rawRows = parseExcelBuffer(req.file.buffer);
    } else {
      rawRows = parseCsvBuffer(req.file.buffer);
    }

    const rows = rawRows.map(normalizeRow);

    const allBranches = await db.select({ id: branchesTable.id, name: branchesTable.name }).from(branchesTable);
    const branchMap = new Map<string, number>();
    for (const b of allBranches) {
      branchMap.set(b.name.toLowerCase().trim(), b.id);
    }

    const existingUsers = await db.select({ telegramId: usersTable.telegramId }).from(usersTable);
    const existingTelegramIds = new Set(existingUsers.map(u => u.telegramId));

    const created: Array<{ row: number; name: string; telegramId: string; role: string; branch: string; password: string }> = [];
    const skipped: Array<{ row: number; reason: string; name?: string; telegramId?: string }> = [];

    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        if (!row.telegramId || !row.name) {
          skipped.push({ row: rowNum, reason: "missing_required_fields", name: row.name, telegramId: row.telegramId });
          continue;
        }

        if (existingTelegramIds.has(row.telegramId)) {
          skipped.push({ row: rowNum, reason: "duplicate_telegram_id", name: row.name, telegramId: row.telegramId });
          continue;
        }

        const password = row.password || generatePassword();
        const passwordHash = await bcrypt.hash(password, 10);
        const role = resolveRole(row.role || "branch_head");

        let branchId: number | null = null;
        const branchInput = row.branch || "";
        if (branchInput) {
          const exactMatch = branchMap.get(branchInput.toLowerCase().trim());
          if (exactMatch) {
            branchId = exactMatch;
          } else {
            const searchTerm = branchInput.toLowerCase().trim();
            for (const [name, id] of branchMap.entries()) {
              if (name.includes(searchTerm) || searchTerm.includes(name)) {
                branchId = id;
                break;
              }
            }
          }
        }

        try {
          await tx.insert(usersTable).values({
            telegramId: row.telegramId,
            name: row.name,
            role,
            branchId,
            passwordHash,
            isActive: true,
          });

          existingTelegramIds.add(row.telegramId);

          const branchName = branchId
            ? allBranches.find(b => b.id === branchId)?.name || ""
            : "";

          created.push({
            row: rowNum,
            name: row.name,
            telegramId: row.telegramId,
            role,
            branch: branchName,
            password,
          });
        } catch (insertErr: any) {
          if (insertErr.message?.includes("duplicate") || insertErr.code === "23505") {
            skipped.push({ row: rowNum, reason: "duplicate_telegram_id", name: row.name, telegramId: row.telegramId });
            existingTelegramIds.add(row.telegramId);
          } else {
            throw insertErr;
          }
        }
      }
    });

    await logActivity({
      type: "users_imported",
      description: `Imported ${created.length} users from ${isExcel ? "Excel" : "CSV"}, skipped ${skipped.length}`,
      entityType: "user",
      user: req.user,
    });

    res.json({ imported: created.length, skipped, created });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
