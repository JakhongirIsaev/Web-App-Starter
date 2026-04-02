import { Bot, InlineKeyboard, InputFile } from "grammy";
import { logger } from "./lib/logger";

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
        "Нажмите кнопку ниже, чтобы открыть приложение кредитного эксперта.",
      { reply_markup: keyboard },
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "📖 Minerva — приложение для кредитных экспертов.\n\n" +
        "Команды:\n" +
        "/start — Открыть приложение\n" +
        "/help — Показать справку",
    );
  });

  bot.catch((err) => {
    logger.error({ err: err.error }, "Bot error");
  });

  try {
    const me = await bot.api.getMe();
    logger.info({ botUsername: me.username }, "Telegram bot authenticated");
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    bot.start({
      onStart: () => logger.info("Telegram bot started (polling)"),
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
