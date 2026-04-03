import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { LoginBody } from "@workspace/api-zod";

const router: IRouter = Router();

function validateTelegramInitData(initData: string, botToken: string): { valid: boolean; user?: any } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { valid: false };

    params.delete("hash");
    const entries = Array.from(params.entries());
    entries.sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const computedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (computedHash !== hash) return { valid: false };

    const userStr = params.get("user");
    if (!userStr) return { valid: false };

    return { valid: true, user: JSON.parse(userStr) };
  } catch {
    return { valid: false };
  }
}

router.get("/auth/me", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.app.locals.sessions?.get(token);
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

router.post("/auth/login", async (req, res) => {
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

  const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
  if (!req.app.locals.sessions) {
    req.app.locals.sessions = new Map<string, number>();
  }
  req.app.locals.sessions.set(token, user.id);

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

router.post("/auth/telegram", async (req, res) => {
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
  const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
  if (!req.app.locals.sessions) {
    req.app.locals.sessions = new Map<string, number>();
  }
  req.app.locals.sessions.set(token, user.id);

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

router.post("/auth/logout", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token && req.app.locals.sessions) {
    req.app.locals.sessions.delete(token);
  }
  res.json({ success: true });
});

export default router;
