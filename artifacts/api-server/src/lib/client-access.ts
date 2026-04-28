import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import {
  clientsTable,
  clientDocumentsTable,
  clientNextActionsTable,
  collateralItemsTable,
  collateralEstimatesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthUser } from "../middleware/auth";

export function hasClientRoleAccess(
  client: { assignedToId: number | null; branchId: number | null },
  user: { id: number; role: string; branchId: number | null },
): boolean {
  if (user.role === "superadmin" || user.role === "head_office_admin") return true;
  if (user.role === "branch_head" && user.branchId && client.branchId === user.branchId) return true;
  return client.assignedToId === user.id;
}

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
  return hasClientRoleAccess(client, user);
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
      res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" });
      return;
    }
    const owner = await resolver(id);
    if (!owner) {
      res.status(404).json({ error: notFoundMessage });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: "Требуется авторизация / Avtorizatsiya kerak" });
      return;
    }
    if (!(await verifyClientAccess(owner.clientId, req.user))) {
      res.status(403).json({ error: "Доступ запрещен / Ruxsat yo'q" });
      return;
    }
    next();
  };
}

const resolveCollateralItemOwner: ClientIdResolver = async (id) => {
  const [row] = await db
    .select({ clientId: collateralItemsTable.clientId })
    .from(collateralItemsTable)
    .where(eq(collateralItemsTable.id, id))
    .limit(1);
  return row ?? null;
};

const resolveCollateralEstimateOwner: ClientIdResolver = async (id) => {
  const [row] = await db
    .select({ clientId: collateralEstimatesTable.clientId })
    .from(collateralEstimatesTable)
    .where(eq(collateralEstimatesTable.id, id))
    .limit(1);
  return row ?? null;
};

export const requireClientAccess = makeParamGuard(resolveClientSelf, "Клиент не найден / Mijoz topilmadi");
export const requireDocumentAccess = makeParamGuard(resolveDocumentOwner, "Документ не найден / Hujjat topilmadi");
export const requireNextActionAccess = makeParamGuard(resolveNextActionOwner, "Действие не найдено / Harakat topilmadi");
export const requireCollateralItemAccess = makeParamGuard(
  resolveCollateralItemOwner,
  "Предмет залога не найден / Garov topilmadi",
);
export const requireCollateralEstimateAccess = makeParamGuard(
  resolveCollateralEstimateOwner,
  "Расчёт залога не найден / Garov hisobi topilmadi",
);

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
      res.status(400).json({ error: "Не указан идентификатор / Identifikator ko'rsatilmagan" });
      return;
    }
    const id = parsePositiveInt(raw);
    if (id === null) {
      res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: "Требуется авторизация / Avtorizatsiya kerak" });
      return;
    }
    if (!(await verifyClientAccess(id, req.user))) {
      res.status(403).json({ error: "Доступ запрещен / Ruxsat yo'q" });
      return;
    }
    next();
  };
}

export const __testing = { parsePositiveInt, makeParamGuard };
export type { AuthUser };
