import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { articlesTable, articleVisibilityTable, usersTable } from "@workspace/db";
import { eq, and, ilike, inArray } from "drizzle-orm";
import {
  CreateArticleBody, UpdateArticleBody, GetArticleParams,
  UpdateArticleParams, DeleteArticleParams, ListArticlesQueryParams
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { logActivity } from "../middleware/activity";
import { upload, parseCsvBuffer } from "../lib/csv";

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

router.get("/articles", requireAuth, async (req, res) => {
  const params = ListArticlesQueryParams.safeParse(req.query);
  const conditions: any[] = [];
  if (params.success) {
    if (params.data.isPublished !== undefined) conditions.push(eq(articlesTable.isPublished, params.data.isPublished));
    if (params.data.search) conditions.push(ilike(articlesTable.title, `%${params.data.search}%`));
  }

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
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(articlesTable.createdAt);

  const allIds = rows.map(r => r.id);
  let visibilityMap: Map<number, number[]> = new Map();
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

  res.json(articles);
});

router.post("/articles", requireAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const parsed = CreateArticleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Некорректные данные / Noto'g'ri ma'lumot" }); return; }

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

router.get("/articles/:id", requireAuth, async (req, res) => {
  const params = GetArticleParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  const article = await getArticleWithBranchIds(params.data.id);
  if (!article) { res.status(404).json({ error: "Не найдено / Topilmadi" }); return; }
  res.json(article);
});

router.put("/articles/:id", requireAuth, requireRole("superadmin", "head_office_admin", "editor"), async (req, res) => {
  const params = UpdateArticleParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  const parsed = UpdateArticleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Некорректные данные / Noto'g'ri ma'lumot" }); return; }

  const updateData: Partial<typeof articlesTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.content !== undefined) updateData.content = parsed.data.content;
  if (parsed.data.isPublished !== undefined) updateData.isPublished = parsed.data.isPublished;
  if (parsed.data.targetAllBranches !== undefined) updateData.targetAllBranches = parsed.data.targetAllBranches;
  if (parsed.data.category !== undefined) updateData.category = parsed.data.category;

  const [updated] = await db.update(articlesTable).set(updateData).where(eq(articlesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Не найдено / Topilmadi" }); return; }

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

router.delete("/articles/:id", requireAuth, requireRole("superadmin", "head_office_admin"), async (req, res) => {
  const params = DeleteArticleParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Некорректный идентификатор / Noto'g'ri identifikator" }); return; }
  await db.delete(articleVisibilityTable).where(eq(articleVisibilityTable.articleId, params.data.id));
  await db.delete(articlesTable).where(eq(articlesTable.id, params.data.id));

  await logActivity({ type: "article_deleted", description: "Статья удалена / Maqola o'chirildi", entityId: params.data.id, entityType: "article", user: req.user });

  res.status(204).send();
});

router.post("/articles/import", requireAuth, requireRole("superadmin", "head_office_admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "Файл не загружен / Fayl yuklanmagan" }); return; }
    const rows = parseCsvBuffer(req.file.buffer);
    const skipped: number[] = [];
    let imported = 0;
    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.title || !row.content) { skipped.push(i + 2); continue; }
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
    await logActivity({ type: "articles_imported", description: `Импортировано статей: ${imported} / Import qilingan maqolalar: ${imported}`, entityType: "article", user: req.user });
    res.json({ imported, skipped });
  } catch (err: any) {
    res.status(400).json({ error: "Импорт не выполнен / Import bajarilmadi" });
  }
});

export default router;
