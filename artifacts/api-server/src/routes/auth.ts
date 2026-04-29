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
  message: { error: "Kirishga urinishlar juda ko'p. Keyinroq qayta urinib ko'ring." },
});

const telegramLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Kirishga urinishlar juda ko'p. Keyinroq qayta urinib ko'ring." },
});

const resetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Parolni tiklash so'rovlari juda ko'p. Keyinroq qayta urinib ko'ring." },
});

const resetConfirmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Tasdiqlash urinishlari juda ko'p. Keyinroq qayta urinib ko'ring." },
});

const ResetRequestBody = z.object({
  telegramId: z.string().min(1),
});

const ResetConfirmBody = z.object({
  telegramId: z.string().min(1),
  token: z.string().length(8),
  newPassword: z.string().min(8, "Parol kamida 8 ta belgidan iborat bo'lishi kerak"),
});

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Parol kamida 8 ta belgidan iborat bo'lishi kerak"),
});

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Parolni almashtirish urinishlari juda ko'p. Keyinroq qayta urinib ko'ring." },
});


router.get("/auth/guest", async (_req, res) => {
  const [user] = await db
    .select({
      id: usersTable.id,
      telegramId: usersTable.telegramId,
      name: usersTable.name,
      role: usersTable.role,
      branchId: usersTable.branchId,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(eq(usersTable.isActive, true))
    .limit(1);

  if (!user) {
    res.status(503).json({ error: "No active users" });
    return;
  }

  res.json(user);
});

router.get("/auth/me", async (req, res) => {
  const token = extractBearerToken(req);
  let userId: number | null = null;

  if (token) {
    userId = await findSessionUserId(token);
  }

  const whereClause = userId
    ? eq(usersTable.id, userId)
    : eq(usersTable.isActive, true);

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
    .where(whereClause)
    .limit(1);

  if (!users.length || !users[0].isActive) {
    res.status(401).json({ error: "Ruxsat yo'q" });
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
    res.status(400).json({ error: "Некорректные данные / Noto'g'ri ma'lumot" });
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
    res.status(401).json({ error: "Неверные данные для входа / Kirish ma'lumotlari noto'g'ri" });
    return;
  }

  const user = users[0];
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Неверные данные для входа / Kirish ma'lumotlari noto'g'ri" });
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

// Telegram auto-login is intentionally disabled. Everyone — including
// users opening the mini-app from inside Telegram — authenticates via
// the password form at POST /auth/login using their Telegram-ID + password.
// Keeping the route registered (instead of deleting it) so any stale client
// still in the field gets a clear 403 instead of a hard 404.
router.post("/auth/telegram", telegramLoginLimiter, async (_req, res) => {
  res.status(403).json({
    error: "Telegram orqali avtomatik kirish o'chirilgan. Parol bilan kiring.",
  });
});

// Kept temporarily as a no-op to avoid unused-import warnings for helpers
// that only the old Telegram flow referenced.
void validateTelegramInitData;

router.post("/auth/logout", async (req, res) => {
  const token = extractBearerToken(req);
  if (token) {
    await deleteSession(token);
  }
  res.json({ success: true });
});

router.post("/auth/change-password", changePasswordLimiter, async (req, res) => {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Ruxsat yo'q" });
    return;
  }

  const userId = await findSessionUserId(token);
  if (!userId) {
    res.status(401).json({ error: "Ruxsat yo'q" });
    return;
  }

  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные данные / Noto'g'ri ma'lumot" });
    return;
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!users.length || !users[0].isActive) {
    res.status(401).json({ error: "Ruxsat yo'q" });
    return;
  }

  const user = users[0];
  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Текущий пароль неверный / Joriy parol noto'g'ri" });
    return;
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db
    .update(usersTable)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  res.json({ success: true });
});

router.post("/auth/reset-password-request", resetRequestLimiter, async (req, res) => {
  const parsed = ResetRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные данные / Noto'g'ri ma'lumot" });
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
    res.json({ success: true, message: "Agar akkaunt mavjud bo'lsa, ko'rsatma yuborildi." });
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
    await sendMessage(telegramId, `🔑 <b>Minerva parolni tiklash</b>\n\nTiklash kodi: <code>${otp}</code>\n\nKod 15 daqiqa amal qiladi. Agar bu so'rovni siz yubormagan bo'lsangiz, xabarni e'tiborsiz qoldiring.`);
  } catch {
    await db.update(passwordResetTokensTable).set({ used: true }).where(eq(passwordResetTokensTable.id, inserted.id));
    res.status(500).json({ error: "Tiklash kodini yuborib bo'lmadi. Qayta urinib ko'ring." });
    return;
  }

  res.json({ success: true, message: "Agar akkaunt mavjud bo'lsa, ko'rsatma yuborildi." });
});

router.post("/auth/reset-password-confirm", resetConfirmLimiter, async (req, res) => {
  const parsed = ResetConfirmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные данные / Noto'g'ri ma'lumot", details: parsed.error.issues });
    return;
  }

  const { telegramId, token, newPassword } = parsed.data;
  const cleanTelegramId = telegramId.replace(/\s+/g, "").trim();

  // Use a single opaque error for all failure modes (user not found, bad OTP,
  // expired OTP) so the confirm endpoint cannot be used to enumerate accounts.
  const INVALID = { error: "Kod noto'g'ri yoki muddati tugagan" } as const;

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

  res.json({ success: true, message: "Parol yangilandi" });
});

export default router;
