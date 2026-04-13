import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await Promise.all([
  rm(path.join(rootDir, "package-lock.json"), { force: true }),
  rm(path.join(rootDir, "yarn.lock"), { force: true }),
]);

const userAgent = process.env["npm_config_user_agent"] ?? "";

if (!userAgent.startsWith("pnpm/")) {
  console.error("Use pnpm instead");
  process.exit(1);
}
