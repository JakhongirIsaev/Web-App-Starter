import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { findSessionUserId } from "../lib/session-store";
import { verifySignedObjectParams } from "../lib/signedUrl";
import { hasPermission, type Role } from "../rbac/role-permissions";
import type { Permission } from "../rbac/permissions";

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


// SECURITY (PR-S1): refuse to boot if someone tries to enable DEMO_MODE in
// production. DEMO_MODE installs an open-by-default `guestAuth` fallback
// that hands out the highest-privilege user to any anonymous caller; that
// must NEVER be reachable from a production-exposed instance. This check
// runs at module-import time so the process exits before the listener binds.
if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE === "true") {
  throw new Error(
    "Refusing to start: DEMO_MODE=true is not permitted when NODE_ENV=production. " +
    "DEMO_MODE enables an open auth fallback (guestAuth) that exposes superadmin " +
    "to anonymous callers. Unset DEMO_MODE (or set NODE_ENV=development) and retry.",
  );
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

/**
 * Strict bearer-token authentication. Returns 401 when the Authorization
 * header is missing, malformed, points at an unknown/expired session, or
 * resolves to a deactivated user. Every production-exposed route MUST use
 * this middleware (or `requirePermission` which composes on top of it via
 * the router-level auth chain). Never substitute `guestAuth` for this.
 */
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

/**
 * DEVELOPMENT-ONLY auth fallback. When DEMO_MODE=true (and NODE_ENV is NOT
 * production — enforced by the module-top guard above), unauthenticated
 * requests are silently elevated to the highest-privilege active user so
 * the local demo SPAs can be poked without signing in.
 *
 * WARNING: This MUST NEVER be wired into a route that is reachable from a
 * production deployment. Use `requireAuth` for anything user-facing. The
 * boot guard at the top of this module makes it impossible to launch with
 * NODE_ENV=production + DEMO_MODE=true, but do not rely on that alone —
 * default to `requireAuth` and reach for `guestAuth` only for explicitly
 * dev-only tooling.
 */
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

  // When DEMO_MODE is not enabled, guest fallback is disabled entirely.
  const demoMode = process.env.DEMO_MODE === "true";
  if (!demoMode) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // In demo mode, pick the highest-privilege active user so admin-only
  // routes (activity log, branches admin, imports, deletes) work without
  // anyone signing in. This is the pre-security-audit behaviour and is
  // intentional in DEMO_MODE; production deployments should leave
  // DEMO_MODE unset and require real bearer tokens.
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

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as { user?: { role?: string } }).user;
    if (!user || !user.role) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    if (!hasPermission(user.role as Role, permission)) {
      res.status(403).json({ error: "forbidden", required: permission });
      return;
    }
    next();
  };
}
