import { run } from "graphile-worker";
import { espoSync } from "./espo-sync";
import { dailyReminderScan } from "./daily-reminder-scan";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the worker process");
  }
  const runner = await run({
    connectionString: process.env.DATABASE_URL,
    concurrency: 4,
    pollInterval: 2000,
    taskList: {
      "espo-sync": espoSync,
      "daily-reminder-scan": dailyReminderScan,
    },
    // graphile-worker uses standard 5-field cron (UTC).
    // 09:00 Asia/Tashkent (UTC+5) = 04:00 UTC daily.
    crontab: ["0 4 * * * daily-reminder-scan"].join("\n"),
  });
  // run() returns a runner; .promise resolves when the runner exits
  await runner.promise;
}

main().catch((e) => {
  console.error("worker fatal:", e);
  process.exit(1);
});
