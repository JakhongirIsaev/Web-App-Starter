import crypto from "node:crypto";
import { db, authSessionsTable, usersTable } from "@workspace/db";
import { and, eq, gt, lte } from "drizzle-orm";
import { env } from "./env";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getSessionExpiresAt() {
  return new Date(Date.now() + env.sessionTtlDays * DAY_IN_MS);
}

export async function pruneExpiredSessions() {
  await db.delete(authSessionsTable).where(lte(authSessionsTable.expiresAt, new Date()));
}

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");

  await db.insert(authSessionsTable).values({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: getSessionExpiresAt(),
  });

  return token;
}

export async function getSessionUser(token: string) {
  const [row] = await db
    .select({
      id: usersTable.id,
      telegramId: usersTable.telegramId,
      name: usersTable.name,
      role: usersTable.role,
      branchId: usersTable.branchId,
      isActive: usersTable.isActive,
    })
    .from(authSessionsTable)
    .innerJoin(usersTable, eq(authSessionsTable.userId, usersTable.id))
    .where(
      and(
        eq(authSessionsTable.tokenHash, hashSessionToken(token)),
        gt(authSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row || !row.isActive) {
    return null;
  }

  return row;
}

export async function revokeSession(token: string) {
  await db.delete(authSessionsTable).where(eq(authSessionsTable.tokenHash, hashSessionToken(token)));
}
