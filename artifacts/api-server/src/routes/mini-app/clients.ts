import { Router, type IRouter } from "express";
import {
  db,
  clientsTable,
  usersTable,
  branchesTable,
  clientNotesTable,
  clientNextActionsTable,
  basketsTable,
  calculationsTable,
  clientDocumentsTable,
  enqueueEspoSync,
  eq,
  and,
  desc,
  guestAuth,
  formatDateTimeInAppTimeZone,
  formatFileDate,
  isAllowedStatusTransition,
  isApplicationFrozen,
  requireClientAccess,
  MiniAppCreateClientBody,
  MiniAppNextActionBody,
  MiniAppNoteBody,
  MiniAppUpdateClientBody,
  badRequest,
  notFound,
  conflict,
  internalServerError,
  adminRoles,
  INVALID_BODY_ERROR,
  getDetailedBasketItems,
  getExtractedFieldLabel,
} from "./_shared";
import type {
  ClientStatus,
} from "./_shared";

const router: IRouter = Router();
router.get("/mini-app/clients", guestAuth, async (req, res) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const branchId = req.user!.branchId;
  const status = typeof req.query.status === "string" ? req.query.status as ClientStatus : undefined;
  const gender =
    req.query.gender === "male" || req.query.gender === "female"
      ? req.query.gender
      : undefined;
  const isAdmin = adminRoles.includes(role);

  const conditions: any[] = [];
  if (status) conditions.push(eq(clientsTable.status, status));
  if (gender) conditions.push(eq(clientsTable.gender, gender));
  // data-scope filter — not authorization
  if (role === "branch_head" && branchId) {
    conditions.push(eq(clientsTable.branchId, branchId));
  } else if (!isAdmin) {
    conditions.push(eq(clientsTable.assignedToId, userId));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const clients = await db
    .select({
      id: clientsTable.id,
      sessionId: clientsTable.sessionId,
      fullName: clientsTable.fullName,
      phone: clientsTable.phone,
      status: clientsTable.status,
      gender: clientsTable.gender,
      branchId: clientsTable.branchId,
      assignedToId: clientsTable.assignedToId,
      createdAt: clientsTable.createdAt,
      updatedAt: clientsTable.updatedAt,
    })
    .from(clientsTable)
    .where(whereClause)
    .orderBy(desc(clientsTable.updatedAt))
    .limit(100);

  res.json(clients);
});


router.post("/mini-app/clients", guestAuth, async (req, res) => {
  const userId = req.user!.id;
  const branchId = req.user!.branchId;

  const parsed = MiniAppCreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    // SKIP(PR-E1.5): bespoke envelope uses `issues:` field (not `details:`)
    res.status(400).json({ error: INVALID_BODY_ERROR, issues: parsed.error.flatten() });
    return;
  }
  const {
    fullName,
    phone,
    telegramUsername,
    gender,
    legalName,
    leadSource,
    referrerClientId,
    selfCheckCitizenshipUz,
    selfCheckSixMonthsOperation,
    selfCheckPredominantlyPrivate,
    selfCheckBranchServiceArea,
    purpose,
    desiredAmountUzs,
    desiredTermMonths,
    preferredCurrency,
    preferredLanguage,
    externalUuid,
  } = parsed.data;
  // Normalize the optional Telegram username: strip leading "@" and treat
  // empty / whitespace as null so we don't store junk values.
  const normalizedTelegramUsername = (() => {
    if (telegramUsername === undefined || telegramUsername === null) return null;
    const trimmed = telegramUsername.trim().replace(/^@+/, "");
    return trimmed === "" ? null : trimmed;
  })();
  const sessionId = `S-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  let assignedBranchId = branchId;
  if (!assignedBranchId) {
    const [firstBranch] = await db.select().from(branchesTable).limit(1);
    if (!firstBranch) {
      badRequest(res, "Tizimda filiallar topilmadi");
      return;
    }
    assignedBranchId = firstBranch.id;
  }

  // Phase E: any submitted client is a lead. Self-checks and the loan-intent
  // triple are no longer required at lead time — they were rudiments of the
  // old recommendation flow. Credit info is filled later on client-detail
  // (which promotes status lead → recommendation).
  const hasAnyIdentity =
    !!(fullName && fullName.trim()) ||
    !!(phone && phone.trim()) ||
    !!(legalName && legalName.trim());

  // Phase D1 followup — offline-queue idempotency. The mini-app passes an
  // externalUuid generated at first-send-attempt time. If the request is a
  // replay (server committed but the response was lost in transit), the
  // ON CONFLICT path triggers and we return the previously-inserted row
  // instead of creating a duplicate client. When externalUuid is absent
  // (legacy callers, server-side flows), defaultRandom() in the schema
  // supplies a fresh value and no conflict is possible.
  const inserted = await db
    .insert(clientsTable)
    .values({
      sessionId,
      fullName: fullName || null,
      phone: phone || null,
      telegramUsername: normalizedTelegramUsername,
      status: hasAnyIdentity ? "lead" : "draft",
      branchId: assignedBranchId,
      assignedToId: userId,
      gender: gender ?? null,
      legalName: legalName?.trim() || null,
      leadSource: leadSource ?? null,
      // Only persist the referrer when the lead source actually warrants it.
      // This prevents stray IDs from hanging off non-referral leads.
      referrerClientId:
        leadSource === "referral_existing_client" && referrerClientId
          ? referrerClientId
          : null,
      selfCheckCitizenshipUz: selfCheckCitizenshipUz ?? null,
      selfCheckSixMonthsOperation: selfCheckSixMonthsOperation ?? null,
      selfCheckPredominantlyPrivate: selfCheckPredominantlyPrivate ?? null,
      selfCheckBranchServiceArea: selfCheckBranchServiceArea ?? null,
      purpose: purpose ?? null,
      desiredAmountUzs: desiredAmountUzs !== undefined && desiredAmountUzs !== null
        ? String(desiredAmountUzs)
        : null,
      desiredTermMonths: desiredTermMonths ?? null,
      preferredCurrency: preferredCurrency ?? null,
      preferredLanguage: preferredLanguage ?? null,
      ...(externalUuid ? { externalUuid } : {}),
    })
    .onConflictDoNothing({ target: clientsTable.externalUuid })
    .returning();

  let client;
  let isReplay = false;
  if (inserted.length > 0) {
    client = inserted[0];
  } else {
    // Conflict path: a row with this externalUuid already exists, which only
    // happens when the client supplied an externalUuid we've already seen
    // (i.e. an offline-queue replay of a previously-committed save).
    if (!externalUuid) {
      // Without an explicit externalUuid the DB default would have produced a
      // fresh UUID and no conflict was possible — reaching here would be a
      // genuine bug, not a replay.
      internalServerError(res, "insert_failed_unexpectedly");
      return;
    }
    const [existing] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.externalUuid, externalUuid))
      .limit(1);
    if (!existing) {
      internalServerError(res, "insert_returned_no_rows_no_existing");
      return;
    }
    client = existing;
    isReplay = true;
  }

  // Fire-and-forget Espo sync. Helper swallows errors so a queue hiccup
  // can't fail the user-facing client save. On replay we skip the enqueue:
  // the original insert already enqueued an espo job for this externalUuid,
  // and the espo_sync_jobs unique idempotency_key + graphile-worker jobKey
  // would also dedupe — but skipping avoids a noisy "insert failed" log.
  if (!isReplay) {
    await enqueueEspoSync({ clientId: client.id, externalUuid: client.externalUuid });
  }

  res.json(client);
});


router.get("/mini-app/clients/export-all", guestAuth, async (req, res) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const branchId = req.user!.branchId;

  // data-scope filter — not authorization
  let whereClause;
  if (role === "superadmin" || role === "head_office_admin") {
    whereClause = undefined;
  } else if (role === "branch_head" && branchId) {
    whereClause = eq(clientsTable.branchId, branchId);
  } else {
    whereClause = eq(clientsTable.assignedToId, userId);
  }

  const clients = await db
    .select()
    .from(clientsTable)
    .where(whereClause)
    .orderBy(desc(clientsTable.updatedAt));

  let text = `=== BARCHA MIJOZLAR EKSPORTI ===\n`;
  text += `Sana: ${formatFileDate()}\n`;
  text += `Jami: ${clients.length}\n\n`;

  for (const client of clients) {
    text += `${"=".repeat(50)}\n`;
    text += `F.I.Sh.: ${client.fullName || "-"}\n`;
    text += `Telefon: ${client.phone || "-"}\n`;
    text += `Holat: ${client.status}\n`;
    text += `Yaratilgan sana: ${formatDateTimeInAppTimeZone(client.createdAt)}\n`;

    const docs = await db
      .select()
      .from(clientDocumentsTable)
      .where(eq(clientDocumentsTable.clientId, client.id));

    if (docs.length > 0) {
      text += `Hujjatlar: ${docs.length}\n`;
      for (const doc of docs) {
        text += `  - ${doc.docType} (${doc.fileName})`;
        if (doc.extractedData && typeof doc.extractedData === "object") {
          const entries = Object.entries(doc.extractedData as Record<string, string>);
          if (entries.length > 0) {
            text += `: ${entries.map(([k, v], index) => `${getExtractedFieldLabel(k, "uz", index)}=${v}`).join(", ")}`;
          }
        }
        text += `\n`;
      }
    }

    const clientNotes = await db
      .select()
      .from(clientNotesTable)
      .where(eq(clientNotesTable.clientId, client.id));

    if (clientNotes.length > 0) {
      text += `Izohlar: ${clientNotes.length}\n`;
      for (const n of clientNotes) {
        text += `  - [${formatDateTimeInAppTimeZone(n.createdAt)}] ${n.content}\n`;
      }
    }

    const calcs = await db
      .select()
      .from(calculationsTable)
      .where(eq(calculationsTable.clientId, client.id));

    if (calcs.length > 0) {
      text += `Hisob-kitoblar: ${calcs.length}\n`;
      for (const c of calcs) {
        text += `  - ${c.productName}: ${c.loanAmount} ${c.currency}, ${c.termMonths} oy, ${c.interestRate}%\n`;
      }
    }

    text += `\n`;
  }

  const dateStr = formatFileDate();
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="mijozlar_${dateStr}.txt"; filename*=UTF-8''${encodeURIComponent(`mijozlar_eksport_${dateStr}.txt`)}`);
  res.send(text);
});


router.get("/mini-app/clients/:id", guestAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (!client) {
    notFound(res, "Mijoz topilmadi");
    return;
  }

  const notes = await db
    .select({
      id: clientNotesTable.id,
      type: clientNotesTable.type,
      content: clientNotesTable.content,
      createdAt: clientNotesTable.createdAt,
      userName: usersTable.name,
    })
    .from(clientNotesTable)
    .leftJoin(usersTable, eq(clientNotesTable.userId, usersTable.id))
    .where(eq(clientNotesTable.clientId, clientId))
    .orderBy(desc(clientNotesTable.createdAt));

  const nextActions = await db
    .select()
    .from(clientNextActionsTable)
    .where(and(eq(clientNextActionsTable.clientId, clientId), eq(clientNextActionsTable.isCompleted, false)))
    .orderBy(clientNextActionsTable.actionDate);

  const basket = await db
    .select()
    .from(basketsTable)
    .where(and(eq(basketsTable.clientId, clientId), eq(basketsTable.status, "active")))
    .limit(1);

  const basketItems = await getDetailedBasketItems(clientId);

  const calculations = await db
    .select()
    .from(calculationsTable)
    .where(eq(calculationsTable.clientId, clientId))
    .orderBy(desc(calculationsTable.createdAt));

  res.json({
    client,
    notes,
    nextActions,
    basket: basket[0] || null,
    basketItems,
    calculations,
  });
});


router.put("/mini-app/clients/:id", guestAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const parsed = MiniAppUpdateClientBody.safeParse(req.body);
  if (!parsed.success) {
    // SKIP(PR-E1.5): bespoke envelope uses `issues:` field (not `details:`)
    res.status(400).json({ error: INVALID_BODY_ERROR, issues: parsed.error.flatten() });
    return;
  }
  const {
    fullName,
    phone,
    telegramUsername,
    legalName,
    status,
    latitude,
    longitude,
    gender,
    clientType,
    clientSegment,
    purpose,
    desiredAmountUzs,
    desiredTermMonths,
    preferredCurrency,
  } = parsed.data;

  // Snapshot current state for transition + frozen-fields validation
  const [currentClient] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);
  if (!currentClient) {
    notFound(res, "Mijoz topilmadi / Клиент не найден");
    return;
  }

  // Status transition guard
  if (status !== undefined && status !== currentClient.status) {
    if (!isAllowedStatusTransition(currentClient.status as ClientStatus, status as ClientStatus)) {
      res.status(400).json({
        error: `Holatni o'zgartirish ruxsat etilmagan / Переход статуса не разрешён: ${currentClient.status} → ${status}`,
      });
      return;
    }
  }

  // Freeze credit-application fields once a PDF was already generated.
  // Re-quoting after the offer has been sent should require an explicit
  // status rollback first (which itself goes through the transition graph).
  if (isApplicationFrozen(currentClient.status as ClientStatus)) {
    const triesEditApplication =
      purpose !== undefined ||
      desiredAmountUzs !== undefined ||
      desiredTermMonths !== undefined ||
      preferredCurrency !== undefined;
    if (triesEditApplication) {
      conflict(res, "Taklif allaqachon yuborilgan, kredit arizasini o'zgartirib bo'lmaydi / Заявка зафиксирована, изменение полей кредитной заявки запрещено");
      return;
    }
  }

  const updates: any = { updatedAt: new Date() };
  if (fullName !== undefined) updates.fullName = fullName;
  if (phone !== undefined) updates.phone = phone;
  if (telegramUsername !== undefined) {
    const trimmed = telegramUsername.trim().replace(/^@+/, "");
    updates.telegramUsername = trimmed === "" ? null : trimmed;
  }
  if (legalName !== undefined) {
    const trimmed = legalName.trim();
    updates.legalName = trimmed === "" ? null : trimmed;
  }
  if (status !== undefined) updates.status = status;
  if (latitude !== undefined) updates.latitude = latitude.toString();
  if (longitude !== undefined) updates.longitude = longitude.toString();
  if (gender !== undefined) updates.gender = gender;
  if (clientType !== undefined) updates.clientType = clientType;
  if (clientSegment !== undefined) updates.clientSegment = clientSegment;
  if (purpose !== undefined) updates.purpose = purpose || null;
  if (desiredAmountUzs !== undefined) {
    updates.desiredAmountUzs =
      desiredAmountUzs !== null ? String(desiredAmountUzs) : null;
  }
  if (desiredTermMonths !== undefined) {
    updates.desiredTermMonths = desiredTermMonths ?? null;
  }
  if (preferredCurrency !== undefined) updates.preferredCurrency = preferredCurrency || null;

  // Phase E — auto-promote status from lead/draft → recommendation when all
  // four credit-application fields are populated. Status is the repurposed
  // "credit info ready, needs product picked" stage. Idempotent: if the
  // client is already past `recommendation` we don't downgrade.
  if (
    purpose !== undefined ||
    desiredAmountUzs !== undefined ||
    desiredTermMonths !== undefined ||
    preferredCurrency !== undefined
  ) {
    const nextPurpose = purpose !== undefined ? (purpose || null) : currentClient.purpose;
    const nextAmount =
      desiredAmountUzs !== undefined
        ? (desiredAmountUzs !== null ? String(desiredAmountUzs) : null)
        : currentClient.desiredAmountUzs;
    const nextTerm =
      desiredTermMonths !== undefined ? (desiredTermMonths ?? null) : currentClient.desiredTermMonths;
    const nextCurrency =
      preferredCurrency !== undefined
        ? (preferredCurrency || null)
        : currentClient.preferredCurrency;
    const allCreditFieldsSet =
      !!nextPurpose && !!nextAmount && !!nextTerm && !!nextCurrency;
    if (
      allCreditFieldsSet &&
      (currentClient.status === "draft" || currentClient.status === "lead") &&
      status === undefined
    ) {
      updates.status = "recommendation";
    }
  }

  const [updated] = await db
    .update(clientsTable)
    .set(updates)
    .where(eq(clientsTable.id, clientId))
    .returning();

  res.json(updated);
});


router.post("/mini-app/clients/:id/notes", guestAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const parsed = MiniAppNoteBody.safeParse(req.body);
  if (!parsed.success) {
    // SKIP(PR-E1.5): bespoke envelope uses `issues:` field (not `details:`)
    res.status(400).json({ error: INVALID_BODY_ERROR, issues: parsed.error.flatten() });
    return;
  }
  const { type, content } = parsed.data;

  const [note] = await db
    .insert(clientNotesTable)
    .values({ clientId, userId: req.user!.id, type: type || "note", content })
    .returning();

  res.json(note);
});


router.post("/mini-app/clients/:id/next-action", guestAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const parsed = MiniAppNextActionBody.safeParse(req.body);
  if (!parsed.success) {
    // SKIP(PR-E1.5): bespoke envelope uses `issues:` field (not `details:`)
    res.status(400).json({ error: INVALID_BODY_ERROR, issues: parsed.error.flatten() });
    return;
  }
  const { actionType, actionDate, priority, description } = parsed.data;
  const parsedActionDate = new Date(actionDate);
  if (Number.isNaN(parsedActionDate.getTime())) {
    badRequest(res, INVALID_BODY_ERROR);
    return;
  }

  const [action] = await db
    .insert(clientNextActionsTable)
    .values({
      clientId,
      userId: req.user!.id,
      actionType,
      actionDate: parsedActionDate,
      priority: priority || "medium",
      description,
    })
    .returning();

  res.json(action);
});


export default router;
