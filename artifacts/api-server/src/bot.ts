import { Bot, InlineKeyboard, InputFile } from "grammy";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { usersTable, clientsTable, clientNextActionsTable } from "@workspace/db";
import { eq, and, count, lte, isNull } from "drizzle-orm";

let bot: Bot | null = null;

export function getBot(): Bot | null {
  return bot;
}

export async function sendDocument(chatId: string | number, fileBuffer: Buffer, filename: string, caption?: string) {
  if (!bot) {
    logger.warn("Bot not initialized, cannot send document");
    return false;
  }
  try {
    await bot.api.sendDocument(chatId, new InputFile(fileBuffer, filename), {
      caption: caption || undefined,
    });
    return true;
  } catch (err: any) {
    logger.error({ err: err.message, chatId }, "Failed to send document via Telegram");
    return false;
  }
}

export async function sendMessage(chatId: string | number, text: string) {
  if (!bot) return false;
  try {
    await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });
    return true;
  } catch (err: any) {
    logger.error({ err: err.message, chatId }, "Failed to send message via Telegram");
    return false;
  }
}

async function getUserByTelegramId(telegramId: string) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);
  return user;
}

export async function startBot(miniAppUrl: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set, bot disabled");
    return;
  }

  bot = new Bot(token);

  bot.command("start", async (ctx) => {
    const keyboard = new InlineKeyboard().webApp(
      "🚀 Открыть Minerva",
      miniAppUrl,
    );

    await ctx.reply(
      "👋 Добро пожаловать в Minerva!\n\n" +
        "Нажмите кнопку ниже, чтобы открыть приложение кредитного эксперта.\n\n" +
        "Доступные команды:\n" +
        "/stats — Мои показатели\n" +
        "/clients — Список клиентов\n" +
        "/todo — Задачи на сегодня\n" +
        "/help — Показать справку",
      { reply_markup: keyboard },
    );
  });

  bot.command("stats", async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("❌ Вы не зарегистрированы в системе. Обратитесь к администратору.");
      return;
    }

    const [totalResult] = await db
      .select({ count: count() })
      .from(clientsTable)
      .where(eq(clientsTable.assignedToId, user.id));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [todayResult] = await db
      .select({ count: count() })
      .from(clientsTable)
      .where(and(
        eq(clientsTable.assignedToId, user.id),
        lte(clientsTable.createdAt, new Date()),
      ));

    const [completedResult] = await db
      .select({ count: count() })
      .from(clientsTable)
      .where(and(
        eq(clientsTable.assignedToId, user.id),
        eq(clientsTable.status, "completed"),
      ));

    const [pendingResult] = await db
      .select({ count: count() })
      .from(clientNextActionsTable)
      .where(and(
        eq(clientNextActionsTable.userId, user.id),
        isNull(clientNextActionsTable.completedAt),
      ));

    await ctx.reply(
      `📊 <b>Ваши показатели</b>\n\n` +
      `👤 <b>${user.name}</b>\n\n` +
      `📋 Всего клиентов: <b>${totalResult.count}</b>\n` +
      `✅ Завершено: <b>${completedResult.count}</b>\n` +
      `⏳ Активных задач: <b>${pendingResult.count}</b>`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("clients", async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("❌ Вы не зарегистрированы в системе.");
      return;
    }

    const clients = await db
      .select({
        id: clientsTable.id,
        fullName: clientsTable.fullName,
        phone: clientsTable.phone,
        status: clientsTable.status,
      })
      .from(clientsTable)
      .where(eq(clientsTable.assignedToId, user.id))
      .orderBy(clientsTable.createdAt)
      .limit(20);

    if (clients.length === 0) {
      await ctx.reply("📋 У вас пока нет клиентов. Откройте Mini App, чтобы добавить нового.");
      return;
    }

    const statusEmoji: Record<string, string> = {
      draft: "📝",
      questionnaire: "📋",
      recommendation: "💡",
      basket: "🛒",
      pdf_generated: "📄",
      completed: "✅",
      rejected: "❌",
    };

    let msg = `📋 <b>Ваши клиенты (${clients.length})</b>\n\n`;
    for (const c of clients) {
      const emoji = statusEmoji[c.status] || "📌";
      msg += `${emoji} <b>${c.fullName || "Без имени"}</b>\n`;
      msg += `   ${c.phone || "Нет телефона"} · ${c.status}\n\n`;
    }

    await ctx.reply(msg, { parse_mode: "HTML" });
  });

  bot.command("todo", async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("❌ Вы не зарегистрированы в системе.");
      return;
    }

    const actions = await db
      .select({
        id: clientNextActionsTable.id,
        actionType: clientNextActionsTable.actionType,
        actionDate: clientNextActionsTable.actionDate,
        priority: clientNextActionsTable.priority,
        clientName: clientsTable.fullName,
      })
      .from(clientNextActionsTable)
      .leftJoin(clientsTable, eq(clientNextActionsTable.clientId, clientsTable.id))
      .where(and(
        eq(clientNextActionsTable.userId, user.id),
        isNull(clientNextActionsTable.completedAt),
      ))
      .orderBy(clientNextActionsTable.actionDate)
      .limit(15);

    if (actions.length === 0) {
      await ctx.reply("✅ Нет активных задач! Откройте Mini App для работы.");
      return;
    }

    const typeEmoji: Record<string, string> = {
      follow_up: "📞",
      meeting: "🤝",
      proposal: "📄",
      documents: "📋",
    };

    const priorityEmoji: Record<string, string> = {
      high: "🔴",
      medium: "🟡",
      low: "🟢",
    };

    let msg = `📝 <b>Ваши задачи (${actions.length})</b>\n\n`;
    for (const a of actions) {
      const typeIcon = typeEmoji[a.actionType] || "📌";
      const prioIcon = priorityEmoji[a.priority || "medium"] || "🟡";
      const date = a.actionDate ? new Date(a.actionDate).toLocaleDateString("ru-RU") : "—";
      const isOverdue = a.actionDate && new Date(a.actionDate) < new Date();
      msg += `${typeIcon} ${prioIcon} <b>${a.clientName || "Без имени"}</b>\n`;
      msg += `   ${a.actionType} · ${date}${isOverdue ? " ⚠️ просрочено" : ""}\n\n`;
    }

    await ctx.reply(msg, { parse_mode: "HTML" });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "📖 <b>Minerva — приложение кредитного эксперта</b>\n\n" +
        "Доступные команды:\n" +
        "/start — Открыть Mini App\n" +
        "/stats — Мои показатели\n" +
        "/clients — Список клиентов\n" +
        "/todo — Задачи на сегодня\n" +
        "/help — Показать справку\n\n" +
        "Используйте Mini App для полного доступа ко всем функциям.",
      { parse_mode: "HTML" },
    );
  });

  bot.catch((err) => {
    const desc = (err.error as any)?.description || "";
    if (desc.includes("terminated by other getUpdates request")) {
      logger.warn("Bot polling conflict detected (409) — another instance is running. Stopping this bot instance.");
      bot?.stop();
      return;
    }
    logger.error({ err: err.error }, "Bot error");
  });

  try {
    const me = await bot.api.getMe();
    logger.info({ botUsername: me.username }, "Telegram bot authenticated");
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    bot.start({
      onStart: () => logger.info("Telegram bot started (polling)"),
    }).catch((err: any) => {
      const desc = err?.description || err?.message || "";
      if (desc.includes("terminated by other getUpdates request") || desc.includes("409")) {
        logger.warn("Bot polling stopped due to conflict (409) — another instance is running");
      } else {
        logger.error({ err: desc }, "Bot polling stopped unexpectedly");
      }
    });
  } catch (err: any) {
    logger.error({ err: err.message || err }, "Failed to start Telegram bot — check TELEGRAM_BOT_TOKEN");
    bot = null;
  }
}

export function stopBot() {
  if (bot) {
    bot.stop();
    bot = null;
  }
}
