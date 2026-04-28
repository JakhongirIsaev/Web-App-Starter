import crypto from "node:crypto";

const DEFAULT_TTL_SEC = 5 * 60;
const MAX_TTL_SEC = 60 * 60; // 1h cap on signed-URL lifetime; raise deliberately if ever needed.

function getSecret(): string {
  const secret = process.env.SIGNED_URL_SECRET;
  if (!secret) throw new Error("SIGNED_URL_SECRET env var is required for signed object URLs");
  return secret;
}

function computeHmac(objectPath: string, exp: number): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${objectPath}\n${exp}`)
    .digest("hex");
}

export function createSignedObjectParams(
  objectPath: string,
  ttlSec = DEFAULT_TTL_SEC,
): { exp: number; sig: string; expiresAt: Date } {
  const clamped = Math.min(Math.max(1, ttlSec), MAX_TTL_SEC);
  const exp = Math.floor(Date.now() / 1000) + clamped;
  const sig = computeHmac(objectPath, exp);
  return { exp, sig, expiresAt: new Date(exp * 1000) };
}

export function verifySignedObjectParams(
  objectPath: string,
  rawExp: unknown,
  rawSig: unknown,
): boolean {
  if (typeof rawExp !== "string" || typeof rawSig !== "string") return false;
  const exp = Number(rawExp);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return false;

  if (!/^[0-9a-f]{64}$/i.test(rawSig)) return false;
  const expected = computeHmac(objectPath, exp);
  return crypto.timingSafeEqual(Buffer.from(rawSig, "hex"), Buffer.from(expected, "hex"));
}
