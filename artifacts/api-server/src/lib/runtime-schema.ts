import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function ensureRuntimeSchema() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash text PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamp NOT NULL DEFAULT now(),
      expires_at timestamp NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions (expires_at)
  `);
}
