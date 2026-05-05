import { run } from "graphile-worker";
import { espoSync } from "./espo-sync";

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
    },
  });
  // run() returns a runner; .promise resolves when the runner exits
  await runner.promise;
}

main().catch((e) => {
  console.error("worker fatal:", e);
  process.exit(1);
});
