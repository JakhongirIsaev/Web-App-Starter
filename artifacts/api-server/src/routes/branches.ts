import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateBranchBody, UpdateBranchBody, GetBranchParams, UpdateBranchParams, DeleteBranchParams } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../middleware/activity";

const router: IRouter = Router();

router.get("/branches", requireAuth, async (_req, res) => {
  const branches = await db.select().from(branchesTable).orderBy(branchesTable.name);
  res.json(branches);
});

router.post("/branches", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const parsed = CreateBranchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [branch] = await db.insert(branchesTable).values({
    name: parsed.data.name,
    city: parsed.data.city,
    isActive: parsed.data.isActive ?? true,
  }).returning();

  await logActivity({ type: "branch_created", description: `Branch "${branch.name}" created`, entityId: branch.id, entityType: "branch", user: req.user });

  res.status(201).json(branch);
});

router.get("/branches/:id", requireAuth, async (req, res) => {
  const params = GetBranchParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, params.data.id)).limit(1);
  if (!branch) { res.status(404).json({ error: "Not found" }); return; }
  res.json(branch);
});

router.put("/branches/:id", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = UpdateBranchParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateBranchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const updateData: Partial<typeof branchesTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.city !== undefined) updateData.city = parsed.data.city;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;

  const [updated] = await db.update(branchesTable).set(updateData).where(eq(branchesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  await logActivity({ type: "branch_updated", description: `Branch "${updated.name}" updated`, entityId: updated.id, entityType: "branch", user: req.user });

  res.json(updated);
});

router.delete("/branches/:id", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = DeleteBranchParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(branchesTable).where(eq(branchesTable.id, params.data.id));

  await logActivity({ type: "branch_deleted", description: `Branch deleted`, entityId: params.data.id, entityType: "branch", user: req.user });

  res.status(204).send();
});

export default router;
