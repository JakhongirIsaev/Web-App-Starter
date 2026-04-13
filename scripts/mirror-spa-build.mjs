import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const packageDir = process.cwd();
const sourceDir = path.resolve(packageDir, "dist", "public");
const rootDir = path.resolve(packageDir, "..", "..");
const targetDir = path.resolve(rootDir, "dist", "public");

if (!existsSync(sourceDir)) {
  throw new Error(`Missing SPA build output at ${sourceDir}`);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(path.dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });

console.log(`Mirrored SPA build from ${sourceDir} to ${targetDir}`);
