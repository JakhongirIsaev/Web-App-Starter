import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clientsTable, branchesTable, usersTable, clientDocumentsTable, calculationsTable } from "@workspace/db";
import { eq, and, ilike, sql, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { enqueueEspoSync } from "../lib/espo-enqueue";
import {
  CreateClientBody, UpdateClientBody, GetClientParams,
  UpdateClientParams, ListClientsQueryParams
} from "@workspace/api-zod";
import { guestAuth, requireRole, requirePermission } from "../middleware/auth";
import { requireClientAccess } from "../lib/client-access";
import { logActivity } from "../middleware/activity";
import { upload, parseCsvBuffer } from "../lib/csv";
import { escapeLike } from "../lib/db-helpers";

const router: IRouter = Router();

const INVALID_BODY_MESSAGE = "Некорректные данные / Noto'g'ri ma'lumot";
const NOT_FOUND_MESSAGE = "Не найдено / Topilmadi";
const CLIENT_FALLBACK_NAME = "Ismsiz mijoz";
const STATUS_LABELS: Record<string, string> = {
  draft: "qoralama",
  lead: "lid",
  recommendation: "tavsiya",
  basket: "tanlangan mahsulotlar",
  pdf_generated: "taklif tayyor",
  under_review: "ko'rib chiqilmoqda",
  approved: "tasdiqlangan",
  completed: "yakunlangan",
  rejected: "rad etilgan",
};

function getStatusLabel(status: string) {
  return STATUS_LABELS[status] || "noma'lum holat";
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildClientResponse(c: any, branch: any, assignedTo: any) {
  return {
    id: c.id,
    sessionId: c.sessionId,
    fullName: c.fullName ?? null,
    phone: c.phone ?? null,
    status: c.status,
    branchId: c.branchId,
    branch: branch ?? null,
    assignedToId: c.assignedToId ?? null,
    assignedTo: assignedTo ?? null,
    clientType: c.clientType ?? null,
    clientSegment: c.clientSegment ?? null,
    gender: c.gender ?? null,
    latitude: toNullableNumber(c.latitude),
    longitude: toNullableNumber(c.longitude),
    rejectionReason: c.rejectionReason ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

router.get("/clients", guestAuth, async (req, res) => {
  const user = req.user!;
  const params = ListClientsQueryParams.safeParse(req.query);
  const page = params.success && params.data.page ? params.data.page : 1;
  const pageSize = params.success && params.data.pageSize ? params.data.pageSize : 20;
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [];

  // data-scope filter — not authorization
  if (user.role === "branch_head") {
    if (!user.branchId) {
      res.json({ data: [], total: 0, page, pageSize });
      return;
    }
    conditions.push(eq(clientsTable.branchId, user.branchId));
  } else if (params.success && params.data.branchId) {
    conditions.push(eq(clientsTable.branchId, params.data.branchId));
  }

  if (params.success) {
    if (params.data.assignedTo) conditions.push(eq(clientsTable.assignedToId, params.data.assignedTo));
    if (params.data.status) conditions.push(eq(clientsTable.status, params.data.status as any));
    if (params.data.search) {
      conditions.push(ilike(clientsTable.fullName, `%${escapeLike(params.data.search)}%`));
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(clientsTable).where(where);
  const total = countResult?.count ?? 0;

  const rows = await db
    .select({
      id: clientsTable.id,
      sessionId: clientsTable.sessionId,
      fullName: clientsTable.fullName,
      phone: clientsTable.phone,
      status: clientsTable.status,
      branchId: clientsTable.branchId,
      assignedToId: clientsTable.assignedToId,
      clientType: clientsTable.clientType,
      clientSegment: clientsTable.clientSegment,
      gender: clientsTable.gender,
      latitude: clientsTable.latitude,
      longitude: clientsTable.longitude,
      rejectionReason: clientsTable.rejectionReason,
      createdAt: clientsTable.createdAt,
      updatedAt: clientsTable.updatedAt,
      branchName: branchesTable.name,
      branchCity: branchesTable.city,
      branchIsActive: branchesTable.isActive,
      assignedName: usersTable.name,
      assignedRole: usersTable.role,
    })
    .from(clientsTable)
    .leftJoin(branchesTable, eq(clientsTable.branchId, branchesTable.id))
    .leftJoin(usersTable, eq(clientsTable.assignedToId, usersTable.id))
    .where(where)
    .orderBy(clientsTable.createdAt)
    .limit(pageSize)
    .offset(offset);

  const data = rows.map(c => buildClientResponse(
    c,
    c.branchName ? { id: c.branchId, name: c.branchName, city: c.branchCity, isActive: c.branchIsActive, createdAt: new Date(), updatedAt: new Date() } : null,
    c.assignedName ? { id: c.assignedToId, name: c.assignedName, role: c.assignedRole } : null,
  ));

  res.json({ data, total, page, pageSize });
});

router.post("/clients", guestAuth, requireRole("superadmin", "head_office_admin", "editor", "hunter"), async (req, res) => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: INVALID_BODY_MESSAGE }); return; }
  const [client] = await db.insert(clientsTable).values({
    sessionId: randomUUID(),
    fullName: parsed.data.fullName,
    phone: parsed.data.phone,
    branchId: parsed.data.branchId,
    assignedToId: parsed.data.assignedToId,
    clientType: parsed.data.clientType,
    clientSegment: parsed.data.clientSegment,
    gender: parsed.data.gender,
    latitude: parsed.data.latitude !== undefined ? String(parsed.data.latitude) : undefined,
    longitude: parsed.data.longitude !== undefined ? String(parsed.data.longitude) : undefined,
    rejectionReason: parsed.data.rejectionReason,
    status: "draft",
  }).returning();

  // Fire-and-forget Espo sync. Helper swallows errors so a queue hiccup
  // can't fail the user-facing client save.
  await enqueueEspoSync({ clientId: client.id, externalUuid: client.externalUuid });

  await logActivity({
    type: "client_created",
    description: `Yangi mijoz ${parsed.data.fullName || CLIENT_FALLBACK_NAME} qo'shildi`,
    entityId: client.id,
    entityType: "client",
    user: req.user,
  });

  res.status(201).json(buildClientResponse(client, null, null));
});

router.get("/clients/:id", guestAuth, async (req, res) => {
  const user = req.user!;
  const params = GetClientParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }

  const conditions: any[] = [eq(clientsTable.id, params.data.id)];
  // data-scope filter — not authorization
  if (user.role === "branch_head") {
    if (!user.branchId) {
      res.status(404).json({ error: NOT_FOUND_MESSAGE });
      return;
    }
    conditions.push(eq(clientsTable.branchId, user.branchId));
  }

  const rows = await db
    .select({
      id: clientsTable.id,
      sessionId: clientsTable.sessionId,
      fullName: clientsTable.fullName,
      phone: clientsTable.phone,
      status: clientsTable.status,
      branchId: clientsTable.branchId,
      assignedToId: clientsTable.assignedToId,
      clientType: clientsTable.clientType,
      clientSegment: clientsTable.clientSegment,
      gender: clientsTable.gender,
      latitude: clientsTable.latitude,
      longitude: clientsTable.longitude,
      rejectionReason: clientsTable.rejectionReason,
      createdAt: clientsTable.createdAt,
      updatedAt: clientsTable.updatedAt,
      branchName: branchesTable.name,
      branchCity: branchesTable.city,
      branchIsActive: branchesTable.isActive,
      assignedName: usersTable.name,
      assignedRole: usersTable.role,
    })
    .from(clientsTable)
    .leftJoin(branchesTable, eq(clientsTable.branchId, branchesTable.id))
    .leftJoin(usersTable, eq(clientsTable.assignedToId, usersTable.id))
    .where(and(...conditions))
    .limit(1);

  if (!rows.length) { res.status(404).json({ error: NOT_FOUND_MESSAGE }); return; }
  const c = rows[0];
  const base = buildClientResponse(
    c,
    c.branchName ? { id: c.branchId, name: c.branchName, city: c.branchCity, isActive: c.branchIsActive, createdAt: new Date(), updatedAt: new Date() } : null,
    c.assignedName ? { id: c.assignedToId, name: c.assignedName, role: c.assignedRole } : null,
  );

  // Fetch documents
  const documents = await db
    .select()
    .from(clientDocumentsTable)
    .where(eq(clientDocumentsTable.clientId, params.data.id))
    .orderBy(desc(clientDocumentsTable.createdAt));

  // Fetch calculations
  const calculations = await db
    .select()
    .from(calculationsTable)
    .where(eq(calculationsTable.clientId, params.data.id))
    .orderBy(desc(calculationsTable.createdAt));

  res.json({
    ...base,
    documents,
    calculations,
  });
});

router.put("/clients/:id", guestAuth, requireClientAccess, requirePermission("client.update"), async (req, res) => {
  const user = req.user!;
  const params = UpdateClientParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  const parsed = UpdateClientBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: INVALID_BODY_MESSAGE }); return; }

  const updateData: Partial<typeof clientsTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.fullName !== undefined) updateData.fullName = parsed.data.fullName;
  if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.assignedToId !== undefined) updateData.assignedToId = parsed.data.assignedToId;
  if (parsed.data.clientType !== undefined) updateData.clientType = parsed.data.clientType;
  if (parsed.data.clientSegment !== undefined) updateData.clientSegment = parsed.data.clientSegment;
  if (parsed.data.gender !== undefined) updateData.gender = parsed.data.gender;
  if (parsed.data.latitude !== undefined) updateData.latitude = String(parsed.data.latitude);
  if (parsed.data.longitude !== undefined) updateData.longitude = String(parsed.data.longitude);
  if (parsed.data.rejectionReason !== undefined) updateData.rejectionReason = parsed.data.rejectionReason;

  const [updated] = await db.update(clientsTable).set(updateData).where(eq(clientsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: NOT_FOUND_MESSAGE }); return; }

  if (parsed.data.status) {
    const statusLabel = parsed.data.status === "completed" ? "client_completed" : parsed.data.status === "rejected" ? "client_rejected" : "client_updated";
    await logActivity({
      type: statusLabel,
      description: `Mijoz ${updated.fullName || CLIENT_FALLBACK_NAME} holati ${getStatusLabel(parsed.data.status)} ga o'zgartirildi`,
      entityId: updated.id,
      entityType: "client",
      user: req.user,
    });
  }

  if (parsed.data.assignedToId !== undefined) {
    await logActivity({
      type: "client_reassigned",
      description: `Mijoz ${updated.fullName || CLIENT_FALLBACK_NAME} foydalanuvchi #${parsed.data.assignedToId} ga biriktirildi`,
      entityId: updated.id,
      entityType: "client",
      user: req.user,
    });
  }

  res.json(buildClientResponse(updated, null, null));
});

// Dry-run + commit. Pass ?dryRun=1 to validate + preview without writing.
// Returns per-row validation results so the admin UI can show a confirm-or-fix
// preview before the actual commit.
router.post(
  "/clients/import",
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
      const validStatuses = [
        "draft", "lead", "recommendation", "basket", "pdf_generated",
        "under_review", "approved", "completed", "rejected",
      ] as const;
      type ClientStatus = typeof validStatuses[number];
      const isClientStatus = (s: string): s is ClientStatus =>
        (validStatuses as readonly string[]).includes(s);

      type RowResult = {
        rowNumber: number;
        ok: boolean;
        error?: string;
        fullName?: string | null;
        phone?: string | null;
        branchId?: number;
        status?: ClientStatus;
        assignedToId?: number | null;
      };

      const results: RowResult[] = rows.map((row, i) => {
        const rowNumber = i + 2; // header is row 1
        const branchId = row.branchId ? Number(row.branchId) : NaN;
        if (!row.fullName) {
          return { rowNumber, ok: false, error: "fullName missing" };
        }
        if (!Number.isInteger(branchId) || branchId <= 0) {
          return { rowNumber, ok: false, error: "branchId missing or invalid" };
        }
        const status: ClientStatus =
          row.status && isClientStatus(row.status) ? row.status : "draft";
        return {
          rowNumber,
          ok: true,
          fullName: row.fullName,
          phone: row.phone || null,
          branchId,
          status,
          assignedToId: row.assignedToId ? Number(row.assignedToId) : null,
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
      const insertedClients: { id: number; externalUuid: string }[] = [];
      await db.transaction(async (tx) => {
        for (const row of valid) {
          const [inserted] = await tx
            .insert(clientsTable)
            .values({
              sessionId: randomUUID(),
              fullName: row.fullName ?? null,
              phone: row.phone ?? null,
              status: row.status ?? "draft",
              branchId: row.branchId!,
              assignedToId: row.assignedToId ?? null,
            })
            .returning({ id: clientsTable.id, externalUuid: clientsTable.externalUuid });
          insertedClients.push(inserted);
          imported++;
        }
      });

      // Enqueue Espo sync per imported client after the tx commits. Failures
      // here are swallowed so import success is not blocked by queue issues.
      for (const c of insertedClients) {
        await enqueueEspoSync({ clientId: c.id, externalUuid: c.externalUuid });
      }

      await logActivity({
        type: "clients_imported",
        description: `Импортировано клиентов: ${imported} / Import qilingan mijozlar: ${imported}`,
        entityType: "client",
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
        skippedDetail: skipped,
      });
    } catch (err) {
      res.status(400).json({ error: "Импорт не выполнен / Import bajarilmadi" });
    }
  },
);

export default router;
