import { Router, type IRouter } from "express";
import {
  db,
  clientsTable,
  usersTable,
  branchesTable,
  eq,
  and,
  or,
  guestAuth,
  generateLeaveBehindPdf,
  sendDocument,
  validateTelegramInitData,
  formatFileDate,
  transitionClientStatus,
  StatusTransitionError,
  requireClientAccess,
  verifyClientAccess,
  logger,
  MiniAppGeneratePdfBody,
  badRequest,
  forbidden,
  notFound,
  conflict,
  internalServerError,
  INVALID_BODY_ERROR,
  persistGeneratedClientDocument,
  resolvePdfLanguage,
  resolvePdfLanguageForClient,
  buildLeaveBehindDetails,
} from "./_shared";

const router: IRouter = Router();
router.post("/mini-app/clients/:id/generate-pdf", guestAuth, requireClientAccess, async (req, res) => {
  const clientId = Number(req.params.id);
  const user = req.user!;
  const parsed = MiniAppGeneratePdfBody.safeParse(req.body);
  if (!parsed.success) {
    // SKIP(PR-E1.5): bespoke envelope uses `issues:` field (not `details:`)
    res.status(400).json({ error: INVALID_BODY_ERROR, issues: parsed.error.flatten() });
    return;
  }
  const sendViaTelegram = parsed.data.sendViaTelegram !== false;
  const telegramInitData =
    typeof parsed.data.telegramInitData === "string"
      ? parsed.data.telegramInitData.trim()
      : "";

  // Look up client to resolve expert (assignedTo) and branch.
  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);
  if (!client) {
    // Use a request-only language hint for the 404 since we have no client row.
    const fallbackLang = resolvePdfLanguage(parsed.data.language);
    notFound(res, fallbackLang === "ru" ? "Клиент не найден" : "Mijoz topilmadi");
    return;
  }
  // Phase D2: prefer the client's saved preferredLanguage when no explicit
  // language is in the request body.
  const language = resolvePdfLanguageForClient(parsed.data.language, client.preferredLanguage);

  // Resolve credit expert: prefer the assigned user; fall back to the
  // authenticated caller (mini-app users typically ARE the assigned expert).
  // The leave-behind PDF requires a phone number — fail with a 400 if neither
  // the assigned expert nor the caller has one on file.
  const expertUserId = client.assignedToId ?? user.id;
  const [expertRow] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      phone: usersTable.phone,
      telegramId: usersTable.telegramId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, expertUserId))
    .limit(1);

  if (!expertRow?.name || !expertRow?.phone) {
    // SKIP(PR-E1.5): bespoke envelope ({error, message} top-level, no `details` field)
    res.status(400).json({
      error: "expert_missing_contact",
      message:
        language === "ru"
          ? "У назначенного эксперта не указан телефон. Заполните телефон в профиле."
          : "Tayinlangan ekspertning telefoni ko'rsatilmagan. Profilda telefonni to'ldiring.",
    });
    return;
  }

  // Resolve branch name (display only — falls back to a sensible default).
  let branchName = "IPAK YO'LI";
  if (client.branchId) {
    const [branch] = await db
      .select({ name: branchesTable.name })
      .from(branchesTable)
      .where(eq(branchesTable.id, client.branchId))
      .limit(1);
    if (branch?.name) branchName = branch.name;
  }

  const leaveBehindDetails = await buildLeaveBehindDetails(clientId, client, language);

  // Refuse to mint a PDF that would be useless to the lead. Require at least
  // one of: client identity (fullName / legalName), a populated offer block,
  // or collateral data. Without any of those the document is just header +
  // disclaimer and embarrasses the expert when handed over.
  const hasIdentity = !!(client.fullName?.trim() || client.legalName?.trim());
  const hasOfferContent = leaveBehindDetails.offer !== null;
  const hasCollateralContent = leaveBehindDetails.collateral !== null;
  if (!hasIdentity && !hasOfferContent && !hasCollateralContent) {
    // SKIP(PR-E1.5): bespoke envelope ({error, message} top-level, no `details` field)
    res.status(400).json({
      error: "insufficient_data",
      message: language === "ru"
        ? "Недостаточно данных для PDF: заполните ФИО, заявку или залог."
        : "PDF uchun yetarli ma'lumot yo'q: F.I.Sh, ariza yoki garovni to'ldiring.",
    });
    return;
  }

  try {
    const pdfBuffer = await generateLeaveBehindPdf({
      client: {
        fullName: client.fullName,
        // No businessName column on clients yet — leave null until the schema
        // gains one (the generator already handles the missing case).
        businessName: null,
      },
      expert: { name: expertRow.name, phone: expertRow.phone },
      ...leaveBehindDetails,
      branchName,
      language,
    });

    const filenamePrefix = language === "ru" ? "predlozhenie" : "taklif";
    const fallbackName = language === "ru" ? "klient" : "mijoz";
    const filename = `${filenamePrefix}_${(client.fullName || fallbackName).replace(/\s+/g, "_")}_${formatFileDate()}.pdf`;

    await persistGeneratedClientDocument({
      clientId,
      userId: user.id,
      buffer: pdfBuffer,
      fileName: filename,
      docType: "generated_pdf",
      mimeType: "application/pdf",
    });

    let telegramSent = false;
    let targetTelegramId = expertRow.telegramId || null;

    if (sendViaTelegram && telegramInitData && process.env.TELEGRAM_BOT_TOKEN) {
      const validatedTelegram = validateTelegramInitData(
        telegramInitData,
        process.env.TELEGRAM_BOT_TOKEN,
      );

      if (validatedTelegram.valid && validatedTelegram.user?.id) {
        targetTelegramId = String(validatedTelegram.user.id);
      }
    }

    if (sendViaTelegram && targetTelegramId) {
      const caption = language === "ru"
        ? `Коммерческое предложение: ${client.fullName || "Клиент"}\nЭксперт: ${expertRow.name}`
        : `Tijorat taklifi: ${client.fullName || "Mijoz"}\nEkspert: ${expertRow.name}`;
      telegramSent = await sendDocument(targetTelegramId, pdfBuffer, filename, caption);
    }

    // Route the status change through the state machine so PDF generation
    // can't silently push the client past `recommendation`/`basket` from a
    // disallowed source state. If the client somehow sits at e.g. `approved`,
    // the transition is rejected and we surface a clean 409 instead of a
    // silent overwrite.
    try {
      await transitionClientStatus(clientId, "pdf_generated");
    } catch (err) {
      if (err instanceof StatusTransitionError) {
        conflict(
          res,
          language === "ru"
            ? `Переход статуса не разрешён: ${err.from} → ${err.to}`
            : `Holat o'zgarishi ruxsat etilmagan: ${err.from} → ${err.to}`,
        );
        return;
      }
      throw err;
    }

    res.json({
      success: true,
      telegramSent,
      sentToTelegramId: telegramSent ? targetTelegramId : null,
      pdfSize: pdfBuffer.length,
    });
  } catch (err: any) {
    logger.error({ err }, "PDF generation error");
    internalServerError(res, language === "ru" ? "Не удалось сформировать файл" : "Faylni shakllantirib bo'lmadi");
  }
});

// Phase C4: one-tap "send leave-behind PDF directly to the lead". Tries
// Telegram delivery if the client has a telegramUsername on file, otherwise
// returns a wa.me URL the expert can hand off to WhatsApp. Success cases:
//   { delivered: "telegram", target: "@username" }
//   { delivered: "whatsapp_url", url: "https://wa.me/..." }


router.post(
  "/mini-app/clients/:id/send-pdf-to-lead",
  guestAuth,
  async (req, res) => {
    const clientId = Number(req.params.id);
    // Resolve a request-only language for early errors that fire before we
    // have the client row in hand. Once the client loads we re-resolve with
    // the client's saved preferredLanguage taking effect (Phase D2).
    const requestLanguage = resolvePdfLanguage(req.body?.language);

    if (!Number.isFinite(clientId) || clientId <= 0) {
      badRequest(res, requestLanguage === "ru" ? "Неверный ID клиента" : "Noto'g'ri mijoz ID");
      return;
    }

    if (!(await verifyClientAccess(clientId, req.user!))) {
      forbidden(res, requestLanguage === "ru" ? "Доступ запрещён" : "Ruxsat yo'q");
      return;
    }

    const [client] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId))
      .limit(1);
    if (!client) {
      notFound(res, requestLanguage === "ru" ? "Клиент не найден" : "Mijoz topilmadi");
      return;
    }
    const language = resolvePdfLanguageForClient(req.body?.language, client.preferredLanguage);

    // Resolve expert (assigned user); fall back to the caller. Phone is
    // required for the leave-behind PDF body.
    const expertUserId = client.assignedToId ?? req.user!.id;
    const [expertRow] = await db
      .select({ name: usersTable.name, phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, expertUserId))
      .limit(1);
    if (!expertRow?.name || !expertRow?.phone) {
      // SKIP(PR-E1.5): bespoke envelope ({error, message} top-level, no `details` field)
      res.status(400).json({
        error: "expert_missing_contact",
        message:
          language === "ru"
            ? "У назначенного эксперта не указан телефон. Заполните телефон в профиле."
            : "Tayinlangan ekspertning telefoni ko'rsatilmagan. Profilda telefonni to'ldiring.",
      });
      return;
    }

    let branchName = "IPAK YO'LI";
    if (client.branchId) {
      const [b] = await db
        .select({ name: branchesTable.name })
        .from(branchesTable)
        .where(eq(branchesTable.id, client.branchId))
        .limit(1);
      if (b?.name) branchName = b.name;
    }

    const leaveBehindDetails = await buildLeaveBehindDetails(clientId, client, language);

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generateLeaveBehindPdf({
        client: { fullName: client.fullName, businessName: null },
        expert: { name: expertRow.name, phone: expertRow.phone },
        ...leaveBehindDetails,
        branchName,
        language,
      });
    } catch (err: any) {
      logger.error({ err, clientId }, "send-pdf-to-lead: PDF generation failed");
      res.status(500).json({
        error: language === "ru" ? "Не удалось сформировать файл" : "Faylni shakllantirib bo'lmadi",
      });
      return;
    }

    const fallbackName = language === "ru" ? "klient" : "mijoz";
    const filenamePrefix = language === "ru" ? "predlozhenie" : "taklif";
    const filename = `${filenamePrefix}_${(client.fullName || fallbackName).replace(/\s+/g, "_")}_${formatFileDate()}.pdf`;
    const caption =
      language === "ru"
        ? "Ваше индикативное предложение"
        : "Indikativ taklifingiz";

    await persistGeneratedClientDocument({
      clientId,
      userId: req.user!.id,
      buffer: pdfBuffer,
      fileName: filename,
      docType: "generated_pdf",
      mimeType: "application/pdf",
    });

    // Try Telegram delivery first when we have a username on file. grammy's
    // bot.api.sendDocument accepts either a numeric chat_id or a "@username"
    // string, so we forward the username as-is. If delivery fails (most
    // commonly because the user has never started a conversation with the
    // bot) we fall through to the WhatsApp URL.
    if (client.telegramUsername) {
      const username = client.telegramUsername.trim().replace(/^@+/, "");
      if (username) {
        const target = `@${username}`;
        const sent = await sendDocument(target, pdfBuffer, filename, caption);
        if (sent) {
          // Promote status so the funnel reflects that the client received the PDF.
          await db
            .update(clientsTable)
            .set({ status: "pdf_generated", updatedAt: new Date() })
            .where(eq(clientsTable.id, clientId));
          res.json({ delivered: "telegram", target });
          return;
        }
        logger.warn({ target, clientId }, "telegram delivery failed, falling back to WhatsApp URL");
      }
    }

    // Fallback: WhatsApp URL the expert opens themselves and forwards.
    if (client.phone) {
      const phoneClean = client.phone.replace(/[^0-9]/g, "");
      if (phoneClean) {
        const message =
          language === "ru"
            ? "Здравствуйте! Я отправляю Вам наше индикативное предложение."
            : "Salom! Sizga indikativ taklifimizni yuboraman.";
        const url = `https://wa.me/${phoneClean}?text=${encodeURIComponent(message)}`;
        res.json({ delivered: "whatsapp_url", url });
        return;
      }
    }

    // SKIP(PR-E1.5): bespoke envelope ({error, message} top-level, no `details` field)
    res.status(400).json({
      error: "no_delivery_channel",
      message:
        language === "ru"
          ? "Нет ни Telegram, ни телефона у клиента"
          : "Mijozda Telegram va telefon yo'q",
    });
  },
);


router.get("/mini-app/clients/:id/download-pdf", guestAuth, async (req, res) => {
  const clientId = Number(req.params.id);
  // Pre-client request-language hint for the access/404 error paths. Once
  // the client loads we re-resolve, allowing client.preferredLanguage to win
  // when the request didn't pin a language explicitly (Phase D2).
  const requestLanguage = resolvePdfLanguage(req.query.language);

  if (!(await verifyClientAccess(clientId, req.user!))) {
    forbidden(res, requestLanguage === "ru" ? "Доступ запрещен" : "Ruxsat yo'q");
    return;
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);
  if (!client) {
    notFound(res, requestLanguage === "ru" ? "Клиент не найден" : "Mijoz topilmadi");
    return;
  }
  const language = resolvePdfLanguageForClient(req.query.language, client.preferredLanguage);

  const expertUserId = client.assignedToId ?? req.user!.id;
  const [expertRow] = await db
    .select({ name: usersTable.name, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, expertUserId))
    .limit(1);

  if (!expertRow?.name || !expertRow?.phone) {
    // SKIP(PR-E1.5): bespoke envelope ({error, message} top-level, no `details` field)
    res.status(400).json({
      error: "expert_missing_contact",
      message:
        language === "ru"
          ? "У назначенного эксперта не указан телефон. Заполните телефон в профиле."
          : "Tayinlangan ekspertning telefoni ko'rsatilmagan. Profilda telefonni to'ldiring.",
    });
    return;
  }

  let branchName = "IPAK YO'LI";
  if (client.branchId) {
    const [branch] = await db
      .select({ name: branchesTable.name })
      .from(branchesTable)
      .where(eq(branchesTable.id, client.branchId))
      .limit(1);
    if (branch?.name) branchName = branch.name;
  }

  const leaveBehindDetails = await buildLeaveBehindDetails(clientId, client, language);

  try {
    const pdfBuffer = await generateLeaveBehindPdf({
      client: { fullName: client.fullName, businessName: null },
      expert: { name: expertRow.name, phone: expertRow.phone },
      ...leaveBehindDetails,
      branchName,
      language,
    });

    const fileDate = formatFileDate();
    const filePrefix = language === "ru" ? "predlozhenie" : "taklif";
    const fallbackName = language === "ru" ? "klient" : "mijoz";
    const safeName = `${filePrefix}_${client.id}_${fileDate}.pdf`;
    const displayName = `${filePrefix}_${(client.fullName || fallbackName).replace(/\s+/g, "_")}_${fileDate}.pdf`;

    await persistGeneratedClientDocument({
      clientId,
      userId: req.user!.id,
      buffer: pdfBuffer,
      fileName: displayName,
      docType: "generated_pdf",
      mimeType: "application/pdf",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(displayName)}`);
    res.send(pdfBuffer);
  } catch (err: any) {
    logger.error({ err }, "PDF download error");
    internalServerError(res, language === "ru" ? "Не удалось сформировать файл" : "Faylni shakllantirib bo'lmadi");
  }
});


export default router;
