import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clientsTable, branchesTable, usersTable, questionnaireSessionsTable, questionnaireAnswersTable, clientDocumentsTable, calculationsTable } from "@workspace/db";
import { eq, and, ilike, sql, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  CreateClientBody, UpdateClientBody, GetClientParams,
  UpdateClientParams, ListClientsQueryParams
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../middleware/activity";
import { upload, parseCsvBuffer } from "../lib/csv";

const router: IRouter = Router();

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
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

router.get("/clients", requireAuth, async (req, res) => {
  const user = req.user!;
  const params = ListClientsQueryParams.safeParse(req.query);
  const page = params.success && params.data.page ? params.data.page : 1;
  const pageSize = params.success && params.data.pageSize ? params.data.pageSize : 20;
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [];

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
      conditions.push(ilike(clientsTable.fullName, `%${params.data.search}%`));
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

router.post("/clients", requireAuth, requireRole("superadmin", "head_office_admin", "editor", "hunter"), async (req, res) => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [client] = await db.insert(clientsTable).values({
    sessionId: randomUUID(),
    fullName: parsed.data.fullName,
    phone: parsed.data.phone,
    branchId: parsed.data.branchId,
    assignedToId: parsed.data.assignedToId,
    status: "draft",
  }).returning();

  await logActivity({
    type: "client_created",
    description: `New client ${parsed.data.fullName || "Anonymous"} added`,
    entityId: client.id,
    entityType: "client",
    user: req.user,
  });

  res.status(201).json(client);
});

router.get("/clients/:id", requireAuth, async (req, res) => {
  const user = req.user!;
  const params = GetClientParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const conditions: any[] = [eq(clientsTable.id, params.data.id)];
  if (user.role === "branch_head") {
    if (!user.branchId) {
      res.status(404).json({ error: "Not found" });
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

  if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
  const c = rows[0];
  const base = buildClientResponse(
    c,
    c.branchName ? { id: c.branchId, name: c.branchName, city: c.branchCity, isActive: c.branchIsActive, createdAt: new Date(), updatedAt: new Date() } : null,
    c.assignedName ? { id: c.assignedToId, name: c.assignedName, role: c.assignedRole } : null,
  );

  // Fetch questionnaire answers
  let questionnaireAnswers: Array<{ questionKey: string; answer: string }> = [];
  const [latestSession] = await db
    .select()
    .from(questionnaireSessionsTable)
    .where(eq(questionnaireSessionsTable.clientId, params.data.id))
    .orderBy(desc(questionnaireSessionsTable.id))
    .limit(1);

  if (latestSession) {
    questionnaireAnswers = await db
      .select({ questionKey: questionnaireAnswersTable.questionKey, answer: questionnaireAnswersTable.answer })
      .from(questionnaireAnswersTable)
      .where(eq(questionnaireAnswersTable.sessionId, latestSession.id))
      .orderBy(questionnaireAnswersTable.id);
  }

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
    questionnaireAnswers,
    documents,
    calculations,
  });
});

router.put("/clients/:id", requireAuth, async (req, res) => {
  const user = req.user!;
  const params = UpdateClientParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateClientBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  if (user.role === "branch_head") {
    res.status(403).json({ error: "Branch heads have view-only access to clients" });
    return;
  }

  const updateData: Partial<typeof clientsTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.fullName !== undefined) updateData.fullName = parsed.data.fullName;
  if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.assignedToId !== undefined) updateData.assignedToId = parsed.data.assignedToId;

  const [updated] = await db.update(clientsTable).set(updateData).where(eq(clientsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  if (parsed.data.status) {
    const statusLabel = parsed.data.status === "completed" ? "client_completed" : parsed.data.status === "rejected" ? "client_rejected" : "client_updated";
    await logActivity({
      type: statusLabel,
      description: `Client ${updated.fullName || "Anonymous"} status changed to ${parsed.data.status.replace(/_/g, " ")}`,
      entityId: updated.id,
      entityType: "client",
      user: req.user,
    });
  }

  if (parsed.data.assignedToId !== undefined) {
    await logActivity({
      type: "client_reassigned",
      description: `Client ${updated.fullName || "Anonymous"} reassigned to user #${parsed.data.assignedToId}`,
      entityId: updated.id,
      entityType: "client",
      user: req.user,
    });
  }

  res.json(updated);
});

router.post("/clients/import", requireAuth, requireRole("superadmin", "head_office_admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const rows = parseCsvBuffer(req.file.buffer);
    const skipped: number[] = [];
    let imported = 0;
    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.fullName) { skipped.push(i + 2); continue; }
        await tx.insert(clientsTable).values({
          sessionId: row.sessionId || randomUUID(),
          fullName: row.fullName || null,
          phone: row.phone || null,
          status: row.status || "draft",
          branchId: row.branchId ? Number(row.branchId) : null,
          assignedToId: row.assignedToId ? Number(row.assignedToId) : null,
        });
        imported++;
      }
    });
    await logActivity({ type: "clients_imported", description: `Imported ${imported} clients from CSV`, entityType: "client", user: req.user });
    res.json({ imported, skipped });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
