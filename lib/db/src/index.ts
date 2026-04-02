import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = process.env.DATABASE_URL;

function shouldUseSsl(url: string): boolean {
  if (process.env.PGSSLMODE === "require" || process.env.DATABASE_SSL === "require") {
    return true;
  }

  try {
    const parsed = new URL(url);
    return (
      parsed.searchParams.get("sslmode") === "require" ||
      parsed.hostname.endsWith(".proxy.rlwy.net")
    );
  } catch {
    return false;
  }
}

export const pool = new Pool({
  connectionString,
  ...(shouldUseSsl(connectionString)
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
