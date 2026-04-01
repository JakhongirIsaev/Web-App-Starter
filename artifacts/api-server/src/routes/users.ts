import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, branchesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  CreateUserBody, UpdateUserBody, GetUserParams, UpdateUserParams,
  DeleteUserParams, DeactivateUserParams, ActivateUserParams, ListUsersQueryParams
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getUserWithBranch(id: number) {
  const rows = await db
    .select({
      id: usersTable.id,
      telegramId: usersTable.telegramId,
      name: usersTable.name,
      role: usersTable.role,
      branchId: usersTable.branchId,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
      branchName: branchesTable.name,
      branchCity: branchesTable.city,
      branchIsActive: branchesTable.isActive,
      branchCreatedAt: branchesTable.createdAt,
      branchUpdatedAt: branchesTable.updatedAt,
    })
    .from(usersTable)
    .leftJoin(branchesTable, eq(usersTable.branchId, branchesTable.id))
    .where(eq(usersTable.id, id))
    .limit(1);

  if (!rows.length) return null;
  const u = rows[0];
  return {
    id: u.id,
    telegramId: u.telegramId,
    name: u.name,
    role: u.role,
    branchId: u.branchId ?? null,
    branch: u.branchId ? {
      id: u.branchId,
      name: u.branchName!,
      city: u.branchCity!,
      isActive: u.branchIsActive!,
      createdAt: u.branchCreatedAt,
      updatedAt: u.branchUpdatedAt,
    } : null,
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

router.get("/users", async (req, res) => {
  const params = ListUsersQueryParams.safeParse(req.query);
  const conditions = [];
  if (params.success) {
    if (params.data.branchId !== undefined) conditions.push(eq(usersTable.branchId, params.data.branchId));
    if (params.data.isActive !== undefined) conditions.push(eq(usersTable.isActive, params.data.isActive));
  }

  const rows = await db
    .select({
      id: usersTable.id,
      telegramId: usersTable.telegramId,
      name: usersTable.name,
      role: usersTable.role,
      branchId: usersTable.branchId,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
      branchName: branchesTable.name,
      branchCity: branchesTable.city,
      branchIsActive: branchesTable.isActive,
      branchCreatedAt: branchesTable.createdAt,
      branchUpdatedAt: branchesTable.updatedAt,
    })
    .from(usersTable)
    .leftJoin(branchesTable, eq(usersTable.branchId, branchesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(usersTable.name);

  const users = rows.map(u => ({
    id: u.id,
    telegramId: u.telegramId,
    name: u.name,
    role: u.role,
    branchId: u.branchId ?? null,
    branch: u.branchId ? {
      id: u.branchId,
      name: u.branchName!,
      city: u.branchCity!,
      isActive: u.branchIsActive!,
      createdAt: u.branchCreatedAt,
      updatedAt: u.branchUpdatedAt,
    } : null,
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));

  res.json(users);
});

router.post("/users", async (req, res) => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const [user] = await db.insert(usersTable).values({
    telegramId: parsed.data.telegramId,
    name: parsed.data.name,
    role: parsed.data.role,
    branchId: parsed.data.branchId ?? null,
    passwordHash,
    isActive: true,
  }).returning();
  const full = await getUserWithBranch(user.id);
  res.status(201).json(full);
});

router.get("/users/:id", async (req, res) => {
  const params = GetUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = await getUserWithBranch(params.data.id);
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(user);
});

router.put("/users/:id", async (req, res) => {
  const params = UpdateUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const updateData: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
  if (parsed.data.branchId !== undefined) updateData.branchId = parsed.data.branchId;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
  if (parsed.data.password !== undefined) {
    updateData.passwordHash = await bcrypt.hash(parsed.data.password, 10);
  }

  const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  const full = await getUserWithBranch(updated.id);
  res.json(full);
});

router.delete("/users/:id", async (req, res) => {
  const params = DeleteUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(usersTable).where(eq(usersTable.id, params.data.id));
  res.status(204).send();
});

router.post("/users/:id/deactivate", async (req, res) => {
  const params = DeactivateUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [updated] = await db.update(usersTable).set({ isActive: false, updatedAt: new Date() }).where(eq(usersTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  const full = await getUserWithBranch(updated.id);
  res.json(full);
});

router.post("/users/:id/activate", async (req, res) => {
  const params = ActivateUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [updated] = await db.update(usersTable).set({ isActive: true, updatedAt: new Date() }).where(eq(usersTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  const full = await getUserWithBranch(updated.id);
  res.json(full);
});

export default router;
