import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { recommendationDocumentsTable } from "@workspace/db";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { guestAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../middleware/activity";

const router: IRouter = Router();

const ADMIN_ROLES = ["superadmin", "head_office_admin"] as const;

const CreateDocumentBody = z.object({
  title: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
  tags: z.string().max(500).optional().default(""),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).max(100000).optional().default(0),
});

const UpdateDocumentBody = z.object({
  title: z.string().min(1).max(300).optional(),
  body: z.string().min(1).max(20000).optional(),
  tags: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});

// Public read — any authenticated user can see active documents.
router.get("/recommendation-documents", guestAuth, async (_req, res) => {
  const rows = await db
    .select()
    .from(recommendationDocumentsTable)
    .where(eq(recommendationDocumentsTable.isActive, true))
    .orderBy(asc(recommendationDocumentsTable.sortOrder), desc(recommendationDocumentsTable.updatedAt));
  res.json(rows);
});

// Admin list — includes inactive docs.
router.get(
  "/admin/recommendation-documents",
  guestAuth,
  requireRole(...ADMIN_ROLES),
  async (_req, res) => {
    const rows = await db
      .select()
      .from(recommendationDocumentsTable)
      .orderBy(asc(recommendationDocumentsTable.sortOrder), desc(recommendationDocumentsTable.updatedAt));
    res.json(rows);
  },
);

router.post(
  "/admin/recommendation-documents",
  guestAuth,
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response) => {
    const parsed = CreateDocumentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректные данные", details: parsed.error.issues });
      return;
    }

    const [doc] = await db
      .insert(recommendationDocumentsTable)
      .values({
        ...parsed.data,
        authorId: req.user?.id ?? null,
      })
      .returning();

    await logActivity({
      type: "recommendation_document_created",
      description: `Knowledge base document "${doc.title}" created`,
      entityId: doc.id,
      entityType: "recommendation_document",
      user: req.user,
      metadata: { title: doc.title, tags: doc.tags },
    });

    res.status(201).json(doc);
  },
);

router.patch(
  "/admin/recommendation-documents/:id",
  guestAuth,
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Некорректный идентификатор" });
      return;
    }
    const parsed = UpdateDocumentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректные данные", details: parsed.error.issues });
      return;
    }

    const [existing] = await db
      .select()
      .from(recommendationDocumentsTable)
      .where(eq(recommendationDocumentsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Документ не найден" });
      return;
    }

    const [updated] = await db
      .update(recommendationDocumentsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(recommendationDocumentsTable.id, id))
      .returning();

    await logActivity({
      type: "recommendation_document_updated",
      description: `Knowledge base document "${updated.title}" updated`,
      entityId: updated.id,
      entityType: "recommendation_document",
      user: req.user,
      metadata: { before: existing, after: updated },
    });

    res.json(updated);
  },
);

router.delete(
  "/admin/recommendation-documents/:id",
  guestAuth,
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Некорректный идентификатор" });
      return;
    }
    const [archived] = await db
      .update(recommendationDocumentsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(recommendationDocumentsTable.id, id))
      .returning();
    if (!archived) {
      res.status(404).json({ error: "Документ не найден" });
      return;
    }

    await logActivity({
      type: "recommendation_document_archived",
      description: `Knowledge base document "${archived.title}" archived`,
      entityId: archived.id,
      entityType: "recommendation_document",
      user: req.user,
    });

    res.json({ success: true });
  },
);

export default router;
