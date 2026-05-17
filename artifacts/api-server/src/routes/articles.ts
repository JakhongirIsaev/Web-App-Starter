import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { articlesTable, articleVisibilityTable, usersTable } from "@workspace/db";
import { eq, and, ilike, inArray, count } from "drizzle-orm";
import {
  CreateArticleBody, UpdateArticleBody, GetArticleParams,
  UpdateArticleParams, DeleteArticleParams, ListArticlesQueryParams
} from "@workspace/api-zod";
import { guestAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../middleware/activity";
import { upload, parseCsvBuffer } from "../lib/csv";
import { escapeLike } from "../lib/db-helpers";
import { badRequest, notFound, BILINGUAL_INVALID_BODY, BILINGUAL_NOT_FOUND } from "../lib/errors";

const router: IRouter = Router();

async function getArticleWithBranchIds(id: number) {
  const rows = await db
    .select({
      id: articlesTable.id,
      title: articlesTable.title,
      content: articlesTable.content,
      category: articlesTable.category,
      isPublished: articlesTable.isPublished,
      targetAllBranches: articlesTable.targetAllBranches,
      authorId: articlesTable.authorId,
      createdAt: articlesTable.createdAt,
      updatedAt: articlesTable.updatedAt,
      authorName: usersTable.name,
      authorRole: usersTable.role,
    })
    .from(articlesTable)
    .leftJoin(usersTable, eq(articlesTable.authorId, usersTable.id))
    .where(eq(articlesTable.id, id))
    .limit(1);

  if (!rows.length) return null;
  const a = rows[0];

  const visibility = await db.select().from(articleVisibilityTable).where(eq(articleVisibilityTable.articleId, id));
  const branchIds = visibility.map(v => v.branchId);

  return {
    id: a.id,
    title: a.title,
    content: a.content,
    category: a.category,
    isPublished: a.isPublished,
    targetAllBranches: a.targetAllBranches,
    branchIds,
    authorId: a.authorId ?? null,
    author: a.authorId ? { id: a.authorId, name: a.authorName, role: a.authorRole } : null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

router.get("/articles", guestAuth, async (req, res) => {
  const params = ListArticlesQueryParams.safeParse(req.query);
  const conditions: any[] = [];
  if (params.success) {
    if (params.data.isPublished !== undefined) conditions.push(eq(articlesTable.isPublished, params.data.isPublished));
    if (params.data.search) conditions.push(ilike(articlesTable.title, `%${escapeLike(params.data.search)}%`));
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Number(req.query.limit) || 20);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(articlesTable)
    .where(where);

  const rows = await db
    .select({
      id: articlesTable.id,
      title: articlesTable.title,
      content: articlesTable.content,
      category: articlesTable.category,
      isPublished: articlesTable.isPublished,
      targetAllBranches: articlesTable.targetAllBranches,
      authorId: articlesTable.authorId,
      createdAt: articlesTable.createdAt,
      updatedAt: articlesTable.updatedAt,
    })
    .from(articlesTable)
    .where(where)
    .orderBy(articlesTable.createdAt)
    .limit(limit)
    .offset((page - 1) * limit);

  const allIds = rows.map(r => r.id);
  const visibilityMap: Map<number, number[]> = new Map();
  if (allIds.length > 0) {
    const vis = await db.select().from(articleVisibilityTable).where(inArray(articleVisibilityTable.articleId, allIds));
    for (const v of vis) {
      if (!visibilityMap.has(v.articleId)) visibilityMap.set(v.articleId, []);
      visibilityMap.get(v.articleId)!.push(v.branchId);
    }
  }

  const articles = rows.map(a => ({
    id: a.id,
    title: a.title,
    content: a.content,
    category: a.category,
    isPublished: a.isPublished,
    targetAllBranches: a.targetAllBranches,
    branchIds: visibilityMap.get(a.id) ?? [],
    authorId: a.authorId ?? null,
    author: null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));

  res.json({ data: articles, total, page, limit });
});

router.post("/articles", guestAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const parsed = CreateArticleBody.safeParse(req.body);
  if (!parsed.success) { badRequest(res, BILINGUAL_INVALID_BODY); return; }

  const [article] = await db.insert(articlesTable).values({
    title: parsed.data.title,
    content: parsed.data.content,
    category: parsed.data.category || "general",
    isPublished: parsed.data.isPublished ?? false,
    targetAllBranches: parsed.data.targetAllBranches ?? true,
    authorId: req.user?.id,
  }).returning();

  if (parsed.data.branchIds && parsed.data.branchIds.length > 0) {
    await db.insert(articleVisibilityTable).values(
      parsed.data.branchIds.map(branchId => ({ articleId: article.id, branchId }))
    );
  }

  await logActivity({ type: "article_created", description: `Maqola "${article.title}" yaratildi`, entityId: article.id, entityType: "article", user: req.user });

  const full = await getArticleWithBranchIds(article.id);
  res.status(201).json(full);
});

router.get("/articles/:id", guestAuth, async (req, res) => {
  const params = GetArticleParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { badRequest(res, "Некорректный идентификатор / Noto'g'ri identifikator"); return; }
  const article = await getArticleWithBranchIds(params.data.id);
  if (!article) { notFound(res, BILINGUAL_NOT_FOUND); return; }
  res.json(article);
});

router.put("/articles/:id", guestAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const params = UpdateArticleParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { badRequest(res, "Некорректный идентификатор / Noto'g'ri identifikator"); return; }
  const parsed = UpdateArticleBody.safeParse(req.body);
  if (!parsed.success) { badRequest(res, BILINGUAL_INVALID_BODY); return; }

  const updateData: Partial<typeof articlesTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.content !== undefined) updateData.content = parsed.data.content;
  if (parsed.data.isPublished !== undefined) updateData.isPublished = parsed.data.isPublished;
  if (parsed.data.targetAllBranches !== undefined) updateData.targetAllBranches = parsed.data.targetAllBranches;
  if (parsed.data.category !== undefined) updateData.category = parsed.data.category;

  const [updated] = await db.update(articlesTable).set(updateData).where(eq(articlesTable.id, params.data.id)).returning();
  if (!updated) { notFound(res, BILINGUAL_NOT_FOUND); return; }

  if (parsed.data.branchIds !== undefined) {
    await db.delete(articleVisibilityTable).where(eq(articleVisibilityTable.articleId, params.data.id));
    if (parsed.data.branchIds.length > 0) {
      await db.insert(articleVisibilityTable).values(
        parsed.data.branchIds.map(branchId => ({ articleId: params.data.id, branchId }))
      );
    }
  }

  await logActivity({ type: "article_updated", description: `Maqola "${updated.title}" yangilandi`, entityId: updated.id, entityType: "article", user: req.user });

  const full = await getArticleWithBranchIds(params.data.id);
  res.json(full);
});

router.delete("/articles/:id", guestAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = DeleteArticleParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { badRequest(res, "Некорректный идентификатор / Noto'g'ri identifikator"); return; }
  await db.delete(articleVisibilityTable).where(eq(articleVisibilityTable.articleId, params.data.id));
  await db.delete(articlesTable).where(eq(articlesTable.id, params.data.id));

  await logActivity({ type: "article_deleted", description: "Статья удалена / Maqola o'chirildi", entityId: params.data.id, entityType: "article", user: req.user });

  res.status(204).send();
});

router.post(
  "/articles/import",
  guestAuth,
  requireRole("superadmin", "head_office_admin"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        badRequest(res, "Файл не загружен / Fayl yuklanmagan");
        return;
      }
      const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
      const rows = parseCsvBuffer(req.file.buffer);

      type RowResult = {
        rowNumber: number;
        ok: boolean;
        error?: string;
        title?: string;
        contentPreview?: string;
        isPublished?: boolean;
        targetAllBranches?: boolean;
      };

      const results: RowResult[] = rows.map((row, i) => {
        const rowNumber = i + 2;
        if (!row.title) return { rowNumber, ok: false, error: "title missing" };
        if (!row.content) return { rowNumber, ok: false, error: "content missing" };
        return {
          rowNumber,
          ok: true,
          title: row.title,
          contentPreview: row.content.length > 80 ? row.content.slice(0, 80) + "…" : row.content,
          isPublished: row.isPublished === "true",
          targetAllBranches: row.targetAllBranches !== "false",
        };
      });

      const valid = results.filter((r) => r.ok);
      const skipped = results.filter((r) => !r.ok);

      if (dryRun) {
        res.json({
          dryRun: true,
          total: results.length,
          willImport: valid.length,
          willSkip: skipped.length,
          rows: results,
        });
        return;
      }

      let imported = 0;
      await db.transaction(async (tx) => {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row.title || !row.content) continue;
          await tx.insert(articlesTable).values({
            title: row.title,
            content: row.content,
            isPublished: row.isPublished === "true",
            targetAllBranches: row.targetAllBranches !== "false",
            authorId: req.user?.id,
          });
          imported++;
        }
      });

      await logActivity({
        type: "articles_imported",
        description: `Импортировано статей: ${imported} / Import qilingan maqolalar: ${imported}`,
        entityType: "article",
        user: req.user,
        metadata: {
          imported,
          skipped: skipped.length,
          skippedRows: skipped.map((r) => ({ rowNumber: r.rowNumber, error: r.error })),
        },
      });

      res.json({
        dryRun: false,
        total: results.length,
        imported,
        skipped: skipped.map((r) => r.rowNumber),
      });
    } catch {
      badRequest(res, "Импорт не выполнен / Import bajarilmadi");
    }
  },
);

export default router;
