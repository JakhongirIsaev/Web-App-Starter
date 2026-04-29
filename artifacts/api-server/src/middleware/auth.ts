import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { findSessionUserId } from "../lib/session-store";
import { verifySignedObjectParams } from "../lib/signedUrl";

export interface AuthUser {
  id: number;
  telegramId: string;
  name: string;
  role: string;
  branchId: number | null;
  isActive: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- canonical Express type augmentation
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, value] = header.split(" ", 2);
  if (scheme?.toLowerCase() !== "bearer" || !value) return undefined;
  return value.trim() || undefined;
}

export function extractAuthToken(req: Request): string | undefined {
  return extractBearerToken(req);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractAuthToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = await findSessionUserId(token);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const users = await db
    .select({
      id: usersTable.id,
      telegramId: usersTable.telegramId,
      name: usersTable.name,
      role: usersTable.role,
      branchId: usersTable.branchId,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!users.length || !users[0].isActive) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.user = users[0] as AuthUser;
  next();
}

// Used only by GET /api/storage/file — accepts either a valid session bearer
// OR a short-lived HMAC-signed URL (for <img src> which cannot send headers).
// All other authenticated routes must use requireAuth (bearer-only).
export async function requireAuthOrSignedUrl(req: Request, res: Response, next: NextFunction) {
  const { path: objectPath, exp, sig } = req.query;

  if (typeof exp === "string" && typeof sig === "string") {
    if (typeof objectPath === "string" && verifySignedObjectParams(objectPath, exp, sig)) {
      next();
      return;
    }
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  return requireAuth(req, res, next);
}

export async function guestAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractAuthToken(req);
  if (token) {
    const userId = await findSessionUserId(token);
    if (userId) {
      const users = await db
        .select({
          id: usersTable.id,
          telegramId: usersTable.telegramId,
          name: usersTable.name,
          role: usersTable.role,
          branchId: usersTable.branchId,
          isActive: usersTable.isActive,
        })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (users.length && users[0].isActive) {
        req.user = users[0] as AuthUser;
        return next();
      }
    }
  }

  const [guest] = await db
    .select({
      id: usersTable.id,
      telegramId: usersTable.telegramId,
      name: usersTable.name,
      role: usersTable.role,
      branchId: usersTable.branchId,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(eq(usersTable.isActive, true))
    .orderBy(sql`
      CASE ${usersTable.role}
        WHEN 'superadmin' THEN 0
        WHEN 'head_office_admin' THEN 1
        WHEN 'editor' THEN 2
        WHEN 'branch_head' THEN 3
        WHEN 'hunter' THEN 4
        ELSE 5
      END
    `, usersTable.id)
    .limit(1);

  if (!guest) {
    res.status(503).json({ error: "No active users in system" });
    return;
  }

  req.user = guest as AuthUser;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
