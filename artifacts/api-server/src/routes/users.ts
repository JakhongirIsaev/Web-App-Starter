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
import { deleteSessionsForUser } from "../lib/session-store";

const router: IRouter = Router();

const INVALID_BODY_MESSAGE = "Некорректные данные / Noto'g'ri ma'lumot";
const NOT_FOUND_MESSAGE = "Не найдено / Topilmadi";
const ROLE_LABELS: Record<string, string> = {
  superadmin: "bosh administrator",
  head_office_admin: "bosh ofis administratori",
  branch_head: "filial rahbari",
  hunter: "kredit eksperti",
  editor: "muharrir",
};

function getRoleLabel(role: string) {
  return ROLE_LABELS[role] || "noma'lum rol";
}

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

  if (params.success && params.data.role !== undefined && rolesEnum.includes(params.data.role as UserRole)) {
    conditions.push(eq(usersTable.role, params.data.role as UserRole));
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
  const language = req.query.language === "ru" ? "ru" : "uz";
  const copy = language === "ru"
    ? {
      headers: ["ФИО", "Идентификатор Telegram", "Роль", "Филиал", "Телефон"],
      rows: [
        ["Иванов Иван Иванович", "100000001", "начальник филиала", "Главный офис", "+998901234567"],
        ["Петров Пётр Петрович", "100000002", "кредитный эксперт", "Ташкент", "+998907654321"],
      ],
      sheet: "Пользователи",
      fileName: "shablon_importa_polzovateley.xlsx",
    }
    : {
      headers: ["F.I.Sh.", "Telegram identifikatori", "Rol", "Filial", "Telefon"],
      rows: [
        ["Aliyev Ali Valiyevich", "100000001", "filial boshlig'i", "Bosh ofis", "+998901234567"],
        ["Valiyev Vali Aliyevich", "100000002", "kredit eksperti", "Toshkent", "+998907654321"],
      ],
      sheet: "Foydalanuvchilar",
      fileName: "foydalanuvchilar_import_shabloni.xlsx",
    };

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([copy.headers, ...copy.rows]);

  const colWidths = [
    { wch: 30 },
    { wch: 15 },
    { wch: 20 },
    { wch: 25 },
    { wch: 18 },
  ];
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, copy.sheet);

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${copy.fileName}"`);
  res.send(Buffer.from(buffer));
});

router.post("/users", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: INVALID_BODY_MESSAGE, details: parsed.error }); return; }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const [user] = await db.insert(usersTable).values({
    telegramId: parsed.data.telegramId,
    name: parsed.data.name,
    role: parsed.data.role,
    branchId: parsed.data.branchId ?? null,
    passwordHash,
    isActive: true,
  }).returning();

  await logActivity({ type: "user_created", description: `Foydalanuvchi "${user.name}" ${getRoleLabel(user.role)} roli bilan yaratildi`, entityId: user.id, entityType: "user", user: req.user });

  const full = await getUserWithBranch(user.id);
  res.status(201).json(full);
});

router.get("/users/:id", requireAuth, requireRole("superadmin", "head_office_admin", "branch_head"), async (req, res) => {
  const params = GetUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  const user = await getUserWithBranch(params.data.id);
  if (!user) { res.status(404).json({ error: NOT_FOUND_MESSAGE }); return; }
  res.json(user);
});

router.put("/users/:id", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = UpdateUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: INVALID_BODY_MESSAGE }); return; }

  const updateData: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
  if (parsed.data.branchId !== undefined) updateData.branchId = parsed.data.branchId;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
  if (parsed.data.password !== undefined) {
    updateData.passwordHash = await bcrypt.hash(parsed.data.password, 10);
  }

  const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: NOT_FOUND_MESSAGE }); return; }

  await logActivity({ type: "user_updated", description: `Foydalanuvchi "${updated.name}" yangilandi`, entityId: updated.id, entityType: "user", user: req.user });

  const full = await getUserWithBranch(updated.id);
  res.json(full);
});

router.delete("/users/:id", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = DeleteUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  await db.delete(usersTable).where(eq(usersTable.id, params.data.id));

  await logActivity({ type: "user_deleted", description: "Пользователь удален / Foydalanuvchi o'chirildi", entityId: params.data.id, entityType: "user", user: req.user });

  res.status(204).send();
});

router.post("/users/:id/deactivate", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = DeactivateUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  const [updated] = await db.update(usersTable).set({ isActive: false, updatedAt: new Date() }).where(eq(usersTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: NOT_FOUND_MESSAGE }); return; }

  await deleteSessionsForUser(updated.id);
  await logActivity({ type: "user_deactivated", description: `Foydalanuvchi "${updated.name}" faolsizlantirildi`, entityId: updated.id, entityType: "user", user: req.user });

  const full = await getUserWithBranch(updated.id);
  res.json(full);
});

router.post("/users/:id/revoke-sessions", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = DeactivateUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }

  const [target] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id))
    .limit(1);

  if (!target) { res.status(404).json({ error: NOT_FOUND_MESSAGE }); return; }

  await deleteSessionsForUser(target.id);
  await logActivity({
    type: "user_sessions_revoked",
    description: `"${target.name}" uchun barcha sessiyalar bekor qilindi`,
    entityId: target.id,
    entityType: "user",
    user: req.user,
  });

  res.json({ success: true });
});

router.post("/users/:id/activate", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = ActivateUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  const [updated] = await db.update(usersTable).set({ isActive: true, updatedAt: new Date() }).where(eq(usersTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: NOT_FOUND_MESSAGE }); return; }

  await logActivity({ type: "user_activated", description: `Foydalanuvchi "${updated.name}" faollashtirildi`, entityId: updated.id, entityType: "user", user: req.user });

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
  "f.i.sh.": "name",
  "f.i.sh": "name",
  "имя": "name",
  "name": "name",
  "ism": "name",
  "to'liq ism": "name",
  "telegram id": "telegramId",
  "идентификатор telegram": "telegramId",
  "telegram identifikatori": "telegramId",
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

// Resolves a branch name (free text from import) to a branchId, with a
// case-insensitive exact match preferred and substring match as fallback.
function resolveBranchInput(
  raw: string | undefined,
  branchMap: Map<string, number>,
): number | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const exact = branchMap.get(lower);
  if (exact) return exact;
  for (const [name, id] of branchMap.entries()) {
    if (name.includes(lower) || lower.includes(name)) return id;
  }
  return null;
}

// Two-step import: ?dryRun=1 validates and previews without password
// hashing or DB writes; the no-flag call runs the real insert. Both share
// the parse + branch-resolve + telegramId-duplicate logic so the preview
// matches what commit will actually do.
router.post(
  "/users/import",
  requireAuth,
  requireRole("superadmin", "head_office_admin"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Файл не загружен / Fayl yuklanmagan" });
        return;
      }
      const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";

      const fileName = req.file.originalname || "";
      const isExcel =
        fileName.endsWith(".xlsx") ||
        fileName.endsWith(".xls") ||
        req.file.mimetype ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        req.file.mimetype === "application/vnd.ms-excel";

      const rawRows = isExcel ? parseExcelBuffer(req.file.buffer) : parseCsvBuffer(req.file.buffer);
      const rows = rawRows.map(normalizeRow);

      const allBranches = await db
        .select({ id: branchesTable.id, name: branchesTable.name })
        .from(branchesTable);
      const branchMap = new Map<string, number>();
      for (const b of allBranches) branchMap.set(b.name.toLowerCase().trim(), b.id);

      const existingUsers = await db
        .select({ telegramId: usersTable.telegramId })
        .from(usersTable);
      const existingTelegramIds = new Set(existingUsers.map((u) => u.telegramId));

      type RowResult = {
        rowNumber: number;
        ok: boolean;
        error?: string;
        name?: string;
        telegramId?: string;
        role?: string;
        branchId?: number | null;
        branchName?: string;
        // password is NEVER returned in dry-run; only populated by the commit path
        password?: string;
      };

      // Track in-file duplicates separately so two new rows with the same
      // telegramId both get flagged, not just on the second insert attempt.
      const seenInFile = new Set<string>();
      const results: RowResult[] = rows.map((row, i) => {
        const rowNumber = i + 2;
        if (!row.telegramId || !row.name) {
          return { rowNumber, ok: false, error: "missing_required_fields", name: row.name, telegramId: row.telegramId };
        }
        if (existingTelegramIds.has(row.telegramId)) {
          return { rowNumber, ok: false, error: "duplicate_telegram_id", name: row.name, telegramId: row.telegramId };
        }
        if (seenInFile.has(row.telegramId)) {
          return { rowNumber, ok: false, error: "duplicate_telegram_id_in_file", name: row.name, telegramId: row.telegramId };
        }
        seenInFile.add(row.telegramId);
        const role = resolveRole(row.role || "branch_head");
        const branchId = resolveBranchInput(row.branch, branchMap);
        const branchName = branchId
          ? allBranches.find((b) => b.id === branchId)?.name || ""
          : "";
        return {
          rowNumber,
          ok: true,
          name: row.name,
          telegramId: row.telegramId,
          role,
          branchId,
          branchName,
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

      const created: Array<{
        row: number;
        name: string;
        telegramId: string;
        role: string;
        branch: string;
        password: string;
      }> = [];

      await db.transaction(async (tx) => {
        for (const result of valid) {
          // Re-derive password / hash here so dry-run never costs bcrypt.
          const originalRow = rows[result.rowNumber - 2];
          const password = originalRow.password || generatePassword();
          const passwordHash = await bcrypt.hash(password, 10);
          try {
            await tx.insert(usersTable).values({
              telegramId: result.telegramId!,
              name: result.name!,
              role: result.role as UserRole,
              branchId: result.branchId ?? null,
              passwordHash,
              isActive: true,
            });
            created.push({
              row: result.rowNumber,
              name: result.name!,
              telegramId: result.telegramId!,
              role: result.role!,
              branch: result.branchName || "",
              password,
            });
          } catch (insertErr: any) {
            if (insertErr.message?.includes("duplicate") || insertErr.code === "23505") {
              skipped.push({
                rowNumber: result.rowNumber,
                ok: false,
                error: "duplicate_telegram_id",
                name: result.name,
                telegramId: result.telegramId,
              });
            } else {
              throw insertErr;
            }
          }
        }
      });

      await logActivity({
        type: "users_imported",
        description: `Импортировано пользователей: ${created.length}; пропущено: ${skipped.length}`,
        entityType: "user",
        user: req.user,
        metadata: {
          imported: created.length,
          skipped: skipped.length,
          skippedRows: skipped.map((r) => ({ rowNumber: r.rowNumber, error: r.error })),
        },
      });

      // Existing UI consumers expect { imported, skipped, created } so keep
      // that shape for the commit path. Dry-run callers get the rows shape.
      res.json({
        imported: created.length,
        skipped: skipped.map((r) => ({
          row: r.rowNumber,
          reason: r.error ?? "unknown",
          name: r.name,
          telegramId: r.telegramId,
        })),
        created,
      });
    } catch {
      res.status(400).json({ error: "Импорт не выполнен / Import bajarilmadi" });
    }
  },
);

export default router;
