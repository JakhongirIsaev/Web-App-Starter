import type { Task } from "graphile-worker";
import { db, clientNextActionsTable, clientsTable, usersTable } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { sendMessage } from "../bot";

/**
 * Phase C6: daily reminder scan.
 *
 * Runs once per day (cron-scheduled at 09:00 Asia/Tashkent = 04:00 UTC).
 * Finds every uncompleted next-action whose actionDate is today or earlier,
 * and sends a Telegram DM to the assigned credit expert.
 *
 * Failures sending one reminder must not abort the rest of the run, so each
 * Telegram call is wrapped in try/catch and only logged.
 */
export const dailyReminderScan: Task = async (_payload, helpers) => {
  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const dueActions = await db
    .select({
      actionId: clientNextActionsTable.id,
      actionType: clientNextActionsTable.actionType,
      actionDate: clientNextActionsTable.actionDate,
      priority: clientNextActionsTable.priority,
      description: clientNextActionsTable.description,
      clientFullName: clientsTable.fullName,
      expertId: usersTable.id,
      expertTelegramId: usersTable.telegramId,
      expertName: usersTable.name,
    })
    .from(clientNextActionsTable)
    .leftJoin(clientsTable, eq(clientsTable.id, clientNextActionsTable.clientId))
    .leftJoin(usersTable, eq(usersTable.id, clientNextActionsTable.userId))
    .where(
      and(
        eq(clientNextActionsTable.isCompleted, false),
        lte(clientNextActionsTable.actionDate, todayEnd),
      ),
    );

  helpers.logger.info(`daily-reminder-scan: ${dueActions.length} due actions`);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of dueActions) {
    if (!row.expertTelegramId) {
      skipped += 1;
      continue;
    }

    const dateLabel = row.actionDate
      ? new Date(row.actionDate).toLocaleDateString("ru-RU")
      : "—";
    const clientLabel = row.clientFullName || "клиент";
    const priorityLabel = row.priority || "medium";

    const message =
      `<b>📌 Напоминание: ${escapeHtml(clientLabel)}</b>\n` +
      `Дата: ${escapeHtml(dateLabel)}\n` +
      (row.description ? `Заметка: ${escapeHtml(row.description)}\n` : "") +
      `Приоритет: ${escapeHtml(priorityLabel)}\n` +
      `Тип: ${escapeHtml(row.actionType || "follow_up")}`;

    try {
      const ok = await sendMessage(row.expertTelegramId, message);
      if (ok) {
        sent += 1;
        helpers.logger.info(
          `reminder sent: action=${row.actionId} user=${row.expertId}`,
        );
      } else {
        failed += 1;
        helpers.logger.warn(
          `reminder send returned false: action=${row.actionId} user=${row.expertId}`,
        );
      }
    } catch (err) {
      failed += 1;
      helpers.logger.error(
        `reminder send failed: action=${row.actionId} user=${row.expertId}: ${String(err)}`,
      );
    }
  }

  helpers.logger.info(
    `daily-reminder-scan complete: sent=${sent} skipped=${skipped} failed=${failed}`,
  );
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
