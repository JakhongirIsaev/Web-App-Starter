import crypto from "node:crypto";
import { db, authSessionsTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sessionTtlMs(): number {
  const raw = process.env.SESSION_TTL_MS;
  if (!raw) return DEFAULT_TTL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MS;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  await db.insert(authSessionsTable).values({ tokenHash, userId, expiresAt });
  return { token, expiresAt };
}

export async function findSessionUserId(token: string): Promise<number | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      userId: authSessionsTable.userId,
      expiresAt: authSessionsTable.expiresAt,
    })
    .from(authSessionsTable)
    .where(eq(authSessionsTable.tokenHash, tokenHash))
    .limit(1);

  if (!rows.length) return null;

  if (rows[0].expiresAt.getTime() <= Date.now()) {
    await db.delete(authSessionsTable).where(eq(authSessionsTable.tokenHash, tokenHash));
    return null;
  }

  return rows[0].userId;
}

export async function deleteSession(token: string): Promise<void> {
  if (!token) return;
  const tokenHash = hashToken(token);
  await db.delete(authSessionsTable).where(eq(authSessionsTable.tokenHash, tokenHash));
}

export async function deleteSessionsForUser(userId: number): Promise<void> {
  await db.delete(authSessionsTable).where(eq(authSessionsTable.userId, userId));
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.delete(authSessionsTable).where(lt(authSessionsTable.expiresAt, new Date()));
}

export const __testing = { hashToken, sessionTtlMs };
