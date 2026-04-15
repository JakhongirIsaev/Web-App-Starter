import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import { usersTable, branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { LoginBody } from "@workspace/api-zod";
import { validateTelegramInitData } from "../lib/telegram";
import { createSession, deleteSession, findSessionUserId, deleteSessionsForUser } from "../lib/session-store";
import { extractBearerToken } from "../middleware/auth";
import crypto from "crypto";
import { z } from "zod";
import { sendMessage } from "../bot";
import { passwordResetTokensTable } from "@workspace/db";
import { and, desc } from "drizzle-orm";

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

const resetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reset requests. Try again later." },
});

const resetConfirmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many confirm attempts. Try again later." },
});

const ResetRequestBody = z.object({
  telegramId: z.string().min(1),
});

const ResetConfirmBody = z.object({
  telegramId: z.string().min(1),
  token: z.string().length(8),
  newPassword: z.string().min(8, "Password must be at least 8 characters long"),
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

router.post("/auth/reset-password-request", resetRequestLimiter, async (req, res) => {
  const parsed = ResetRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const telegramId = parsed.data.telegramId.replace(/\s+/g, "").trim();

  const userRes = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);

  if (!userRes.length) {
    // Prevent enumeration. Always return success.
    res.json({ success: true, message: "If the account exists, instructions were sent." });
    return;
  }

  const userId = userRes[0].id;

  // Invalidate any existing unused tokens for this user
  await db
    .update(passwordResetTokensTable)
    .set({ used: true })
    .where(and(eq(passwordResetTokensTable.userId, userId), eq(passwordResetTokensTable.used, false)));

  // Generate 8-digit OTP securely
  const otp = crypto.randomInt(10000000, 99999999).toString();
  const tokenHash = crypto.createHash("sha256").update(otp).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

  const [inserted] = await db.insert(passwordResetTokensTable).values({
    userId,
    tokenHash,
    expiresAt,
  }).returning({ id: passwordResetTokensTable.id });

  // Send OTP via Telegram. If the message fails, roll back the token so the
  // user gets a clean error and can immediately retry (no TTL/rate-limit block).
  try {
    await sendMessage(telegramId, `🔑 <b>Minerva Password Reset</b>\n\nYour reset code is: <code>${otp}</code>\n\nThis code expires in 15 minutes. If you did not request this, please ignore this message.`);
  } catch {
    await db.update(passwordResetTokensTable).set({ used: true }).where(eq(passwordResetTokensTable.id, inserted.id));
    res.status(500).json({ error: "Failed to send reset code. Please try again." });
    return;
  }

  res.json({ success: true, message: "If the account exists, instructions were sent." });
});

router.post("/auth/reset-password-confirm", resetConfirmLimiter, async (req, res) => {
  const parsed = ResetConfirmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input data", details: parsed.error.issues });
    return;
  }

  const { telegramId, token, newPassword } = parsed.data;
  const cleanTelegramId = telegramId.replace(/\s+/g, "").trim();

  // Use a single opaque error for all failure modes (user not found, bad OTP,
  // expired OTP) so the confirm endpoint cannot be used to enumerate accounts.
  const INVALID = { error: "Invalid or expired code" } as const;

  const userRes = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.telegramId, cleanTelegramId))
    .limit(1);

  if (!userRes.length) {
    res.status(400).json(INVALID);
    return;
  }

  const userId = userRes[0].id;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Validate unexpired and unused token
  const tokenRecord = await db
    .select()
    .from(passwordResetTokensTable)
    .where(and(
      eq(passwordResetTokensTable.userId, userId),
      eq(passwordResetTokensTable.tokenHash, tokenHash),
      eq(passwordResetTokensTable.used, false)
    ))
    .orderBy(desc(passwordResetTokensTable.createdAt))
    .limit(1);

  if (!tokenRecord.length || tokenRecord[0].expiresAt.getTime() < Date.now()) {
    res.status(400).json(INVALID);
    return;
  }

  // OTP verified, perform the reset
  const passwordHash = await bcrypt.hash(newPassword, 10);
  
  await db
    .update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  await db
    .update(passwordResetTokensTable)
    .set({ used: true })
    .where(eq(passwordResetTokensTable.id, tokenRecord[0].id));

  // Invalidate ALL sessions instantly
  await deleteSessionsForUser(userId);

  res.json({ success: true, message: "Password updated successfully" });
});

export default router;
