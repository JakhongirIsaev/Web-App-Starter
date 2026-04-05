import { Bot, InlineKeyboard, InputFile } from "grammy";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { usersTable, clientsTable, clientNextActionsTable } from "@workspace/db";
import { eq, and, count, gte, lte, desc } from "drizzle-orm";
import { formatDateInAppTimeZone, startOfAppDay } from "./lib/timezone";

let bot: Bot | null = null;

const adminRoles = ["superadmin", "head_office_admin"] as const;

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

function isAdminRole(role: string) {
  return adminRoles.includes(role as (typeof adminRoles)[number]);
}

function formatRole(role: string) {
  const labels: Record<string, string> = {
    superadmin: "superadmin",
    head_office_admin: "bosh ofis admini",
    branch_head: "filial boshligi",
    hunter: "kredit eksperti",
    editor: "muharrir",
  };

  return labels[role] || role;
}

export async function startBot(miniAppUrl: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set, bot disabled");
    return;
  }

  bot = new Bot(token);

  bot.command("start", async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    const user = telegramId ? await getUserByTelegramId(telegramId) : null;
    const keyboard = new InlineKeyboard().webApp("Minerva mini-ilovasini ochish", miniAppUrl);

    if (user) {
      await ctx.reply(
        `Assalomu alaykum, <b>${user.name}</b>.\n\n` +
          `Siz tizimda <b>${formatRole(user.role)}</b> sifatida ro'yxatdan o'tgansiz.\n` +
          `Mini-ilovani ochib, mijozlar, tavsiyalar va PDF takliflar bilan ishlashingiz mumkin.\n` +
          `Demo uchun boshqa akkaunt kerak bo'lsa, mini-ilovada logout qiling va <b>10000001</b> / <b>password</b> bilan kiring.\n\n` +
          `Buyruqlar:\n` +
          `/stats - ko'rsatkichlar\n` +
          `/clients - mijozlar ro'yxati\n` +
          `/todo - vazifalar\n` +
          `/help - yordam`,
        { parse_mode: "HTML", reply_markup: keyboard },
      );
      return;
    }

    await ctx.reply(
      "Assalomu alaykum.\n\n" +
        "Sizning Telegram akkauntingiz hali Minerva foydalanuvchisi sifatida biriktirilmagan.\n" +
        `Aniqlangan Telegram ID: <b>${telegramId || "noma'lum"}</b>\n\n` +
        "Administrator ushbu ID ni foydalanuvchiga bog'lagach, mini-ilovaga avtomatik kirish ishlaydi. Hozircha qo'lda kirishdan foydalanishingiz mumkin.",
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  bot.command("stats", async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("Sizning Telegram ID tizimda topilmadi. Avval administratorga murojaat qiling.");
      return;
    }

    const today = startOfAppDay();

    const clientBaseFilter =
      isAdminRole(user.role)
        ? undefined
        : user.role === "branch_head" && user.branchId
          ? eq(clientsTable.branchId, user.branchId)
          : eq(clientsTable.assignedToId, user.id);

    const [totalResult] = await db
      .select({ count: count() })
      .from(clientsTable)
      .where(clientBaseFilter);

    const [todayResult] = await db
      .select({ count: count() })
      .from(clientsTable)
      .where(
        clientBaseFilter
          ? and(clientBaseFilter, gte(clientsTable.createdAt, today))
          : gte(clientsTable.createdAt, today)
      );

    const [completedResult] = await db
      .select({ count: count() })
      .from(clientsTable)
      .where(
        clientBaseFilter
          ? and(clientBaseFilter, eq(clientsTable.status, "completed"))
          : eq(clientsTable.status, "completed")
      );

    const [pendingResult] = await db
      .select({ count: count() })
      .from(clientNextActionsTable)
      .where(
        isAdminRole(user.role)
          ? eq(clientNextActionsTable.isCompleted, false)
          : and(eq(clientNextActionsTable.userId, user.id), eq(clientNextActionsTable.isCompleted, false))
      );

    await ctx.reply(
      `📊 <b>Minerva ko'rsatkichlari</b>\n\n` +
        `👤 <b>${user.name}</b>\n` +
        `Rol: <b>${formatRole(user.role)}</b>\n\n` +
        `📋 Jami mijozlar: <b>${totalResult.count}</b>\n` +
        `🆕 Bugun qo'shilgan: <b>${todayResult.count}</b>\n` +
        `✅ Yakunlangan: <b>${completedResult.count}</b>\n` +
        `⏳ Faol vazifalar: <b>${pendingResult.count}</b>`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("clients", async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("Sizning Telegram ID tizimda topilmadi.");
      return;
    }

    const filter =
      isAdminRole(user.role)
        ? undefined
        : user.role === "branch_head" && user.branchId
          ? eq(clientsTable.branchId, user.branchId)
          : eq(clientsTable.assignedToId, user.id);

    const clients = await db
      .select({
        id: clientsTable.id,
        fullName: clientsTable.fullName,
        phone: clientsTable.phone,
        status: clientsTable.status,
      })
      .from(clientsTable)
      .where(filter)
      .orderBy(desc(clientsTable.updatedAt))
      .limit(20);

    if (clients.length === 0) {
      await ctx.reply("Hozircha ko'rsatish uchun mijozlar yo'q. Mini-ilovadan yangi mijoz qo'shishingiz mumkin.");
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

    let msg = `📋 <b>Mijozlar ro'yxati (${clients.length})</b>\n\n`;
    for (const client of clients) {
      msg += `${statusEmoji[client.status] || "📌"} <b>${client.fullName || "Ismsiz mijoz"}</b>\n`;
      msg += `   ${client.phone || "Telefon yo'q"} · ${client.status}\n\n`;
    }

    await ctx.reply(msg, { parse_mode: "HTML" });
  });

  bot.command("todo", async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("Sizning Telegram ID tizimda topilmadi.");
      return;
    }

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

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
      .where(
        isAdminRole(user.role)
          ? and(eq(clientNextActionsTable.isCompleted, false), lte(clientNextActionsTable.actionDate, tomorrow))
          : and(
              eq(clientNextActionsTable.userId, user.id),
              eq(clientNextActionsTable.isCompleted, false),
              lte(clientNextActionsTable.actionDate, tomorrow)
            )
      )
      .orderBy(clientNextActionsTable.actionDate)
      .limit(15);

    if (actions.length === 0) {
      await ctx.reply("Faol vazifalar topilmadi. Mini-ilovadan keyingi harakatlarni rejalashtirishingiz mumkin.");
      return;
    }

    const typeEmoji: Record<string, string> = {
      follow_up: "📞",
      meeting: "🤝",
      proposal: "📄",
      documents: "📁",
    };

    const priorityEmoji: Record<string, string> = {
      high: "🔴",
      medium: "🟠",
      low: "🟢",
    };

    let msg = `🗂 <b>Yaqin vazifalar (${actions.length})</b>\n\n`;
    for (const action of actions) {
      const date = action.actionDate ? formatDateInAppTimeZone(action.actionDate) : "Sana yo'q";
      const overdue = action.actionDate && new Date(action.actionDate) < new Date();
      msg += `${typeEmoji[action.actionType] || "📌"} ${priorityEmoji[action.priority || "medium"] || "🟠"} <b>${action.clientName || "Ismsiz mijoz"}</b>\n`;
      msg += `   ${action.actionType} · ${date}${overdue ? " · kechikkan" : ""}\n\n`;
    }

    await ctx.reply(msg, { parse_mode: "HTML" });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "📘 <b>Minerva yordam</b>\n\n" +
        "/start - mini-ilovani ochish\n" +
        "/stats - ko'rsatkichlarni ko'rish\n" +
        "/clients - mijozlar ro'yxatini ko'rish\n" +
        "/todo - yaqin vazifalarni ko'rish\n" +
        "/help - yordam matnini qayta ochish\n\n" +
        "Mini-ilova ichida so'rovnoma, tavsiya, kalkulyator va PDF taklif yaratish funksiyalari mavjud.",
      { parse_mode: "HTML" },
    );
  });

  bot.catch((err) => {
    const desc = (err.error as any)?.description || "";
    if (desc.includes("terminated by other getUpdates request")) {
      logger.warn("Bot polling conflict detected (409) - another instance is running. Stopping this bot instance.");
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
        logger.warn("Bot polling stopped due to conflict (409) - another instance is running");
      } else {
        logger.error({ err: desc }, "Bot polling stopped unexpectedly");
      }
    });
  } catch (err: any) {
    logger.error({ err: err.message || err }, "Failed to start Telegram bot - check TELEGRAM_BOT_TOKEN");
    bot = null;
  }
}

export function stopBot() {
  if (bot) {
    bot.stop();
    bot = null;
  }
}
