import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { clientsTable, clientDocumentsTable, clientNextActionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthUser } from "../middleware/auth";

export async function verifyClientAccess(
  clientId: number,
  user: { id: number; role: string; branchId: number | null },
): Promise<boolean> {
  const [client] = await db
    .select({ assignedToId: clientsTable.assignedToId, branchId: clientsTable.branchId })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);
  if (!client) return false;
  if (user.role === "superadmin" || user.role === "head_office_admin") return true;
  if (user.role === "branch_head" && user.branchId && client.branchId === user.branchId) return true;
  return client.assignedToId === user.id;
}

function parsePositiveInt(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

type ClientIdResolver = (resourceId: number) => Promise<{ clientId: number } | null>;

const resolveClientSelf: ClientIdResolver = async (id) => ({ clientId: id });

const resolveDocumentOwner: ClientIdResolver = async (id) => {
  const [row] = await db
    .select({ clientId: clientDocumentsTable.clientId })
    .from(clientDocumentsTable)
    .where(eq(clientDocumentsTable.id, id))
    .limit(1);
  return row ?? null;
};

const resolveNextActionOwner: ClientIdResolver = async (id) => {
  const [row] = await db
    .select({ clientId: clientNextActionsTable.clientId })
    .from(clientNextActionsTable)
    .where(eq(clientNextActionsTable.id, id))
    .limit(1);
  return row ?? null;
};

function makeParamGuard(resolver: ClientIdResolver, notFoundMessage: string, paramName = "id") {
  return async function guard(req: Request, res: Response, next: NextFunction) {
    const id = parsePositiveInt(req.params[paramName]);
    if (id === null) {
      res.status(400).json({ error: `Invalid ${paramName}` });
      return;
    }
    const owner = await resolver(id);
    if (!owner) {
      res.status(404).json({ error: notFoundMessage });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!(await verifyClientAccess(owner.clientId, req.user))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    next();
  };
}

export const requireClientAccess = makeParamGuard(resolveClientSelf, "Client not found");
export const requireDocumentAccess = makeParamGuard(resolveDocumentOwner, "Document not found");
export const requireNextActionAccess = makeParamGuard(resolveNextActionOwner, "Next action not found");

export function requireClientAccessFromBody(
  field = "clientId",
  opts: { optional?: boolean } = {},
) {
  return async function guard(req: Request, res: Response, next: NextFunction) {
    const raw = req.body?.[field];
    if (raw === undefined || raw === null) {
      if (opts.optional) {
        next();
        return;
      }
      res.status(400).json({ error: `Missing ${field}` });
      return;
    }
    const id = parsePositiveInt(raw);
    if (id === null) {
      res.status(400).json({ error: `Invalid ${field}` });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!(await verifyClientAccess(id, req.user))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    next();
  };
}

export const __testing = { parsePositiveInt };
export type { AuthUser };
