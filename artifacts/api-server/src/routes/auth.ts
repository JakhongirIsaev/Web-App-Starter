import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import { usersTable, branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { LoginBody } from "@workspace/api-zod";
import { validateTelegramInitData } from "../lib/telegram";
import { createSession, deleteSession, findSessionUserId } from "../lib/session-store";
import { extractBearerToken } from "../middleware/auth";

const router: IRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Try again later." },
});

const telegramLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});

router.get("/auth/me", async (req, res) => {
  const token = extractBearerToken(req);
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
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
      branchName: branchesTable.name,
      branchCity: branchesTable.city,
      branchIsActive: branchesTable.isActive,
    })
    .from(usersTable)
    .leftJoin(branchesTable, eq(usersTable.branchId, branchesTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!users.length || !users[0].isActive) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const u = users[0];
  const branch = u.branchId ? {
    id: u.branchId,
    name: u.branchName!,
    city: u.branchCity!,
    isActive: u.branchIsActive!,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } : null;

  res.json({
    id: u.id,
    telegramId: u.telegramId,
    name: u.name,
    role: u.role,
    branchId: u.branchId ?? null,
    branch,
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  });
});

router.post("/auth/login", loginLimiter, async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const telegramId = parsed.data.telegramId.replace(/\s+/g, "").trim();
  const password = parsed.data.password;

  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);

  if (!users.length || !users[0].isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const user = users[0];
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const { token } = await createSession(user.id);

  let branch = null;
  if (user.branchId) {
    const branches = await db.select().from(branchesTable).where(eq(branchesTable.id, user.branchId)).limit(1);
    if (branches.length) {
      branch = branches[0];
    }
  }

  res.json({
    user: {
      id: user.id,
      telegramId: user.telegramId,
      name: user.name,
      role: user.role,
      branchId: user.branchId ?? null,
      branch,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    token,
  });
});

router.post("/auth/telegram", telegramLoginLimiter, async (req, res) => {
  const { initData } = req.body;
  if (!initData) {
    res.status(400).json({ error: "Missing initData" });
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    res.status(500).json({ error: "Bot not configured" });
    return;
  }

  const result = validateTelegramInitData(initData, botToken);
  if (!result.valid || !result.user) {
    res.status(401).json({ error: "Invalid Telegram data" });
    return;
  }

  const tgUser = result.user;
  const telegramId = String(tgUser.id);

  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);

  if (!users.length || !users[0].isActive) {
    res.status(401).json({ error: "User not registered", telegramId });
    return;
  }

  const user = users[0];
  const { token } = await createSession(user.id);

  let branch = null;
  if (user.branchId) {
    const branches = await db.select().from(branchesTable).where(eq(branchesTable.id, user.branchId)).limit(1);
    if (branches.length) branch = branches[0];
  }

  res.json({
    user: {
      id: user.id,
      telegramId: user.telegramId,
      name: user.name,
      role: user.role,
      branchId: user.branchId ?? null,
      branch,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    token,
  });
});

router.post("/auth/logout", async (req, res) => {
  const token = extractBearerToken(req);
  if (token) {
    await deleteSession(token);
  }
  res.json({ success: true });
});

export default router;
