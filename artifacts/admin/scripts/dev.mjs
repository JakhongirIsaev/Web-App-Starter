import { spawn } from "node:child_process";
import path from "node:path";

const packageDir = path.resolve(import.meta.dirname, "..");
const shouldServeStatic = Boolean(process.env.RAILWAY_PUBLIC_DOMAIN);

const command = shouldServeStatic ? process.execPath : "pnpm";
const args = shouldServeStatic
  ? [path.resolve(packageDir, "..", "..", "scripts", "serve-spa.mjs"), "dist/public"]
  : ["exec", "vite", "--config", "vite.config.ts", "--host", "0.0.0.0"];

const child = spawn(command, args, {
  cwd: packageDir,
  stdio: "inherit",
  env: process.env,
});

function forwardSignal(signal) {
  child.kill(signal);
}

process.on("SIGINT", forwardSignal);
process.on("SIGTERM", forwardSignal);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
