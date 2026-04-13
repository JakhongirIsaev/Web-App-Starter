function parseBoolean(value: string | undefined): boolean {
  return value === "true";
}

function parsePositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Empty URL value");
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function normalizeOrigin(raw: string): string {
  return new URL(normalizeUrl(raw)).origin;
}

function hasAnyUrl(...values: Array<string | undefined>): boolean {
  return values.some((value) => Boolean(value?.trim()));
}

function collectAllowedOrigins() {
  const origins = new Set<string>();

  const candidates = [
    process.env.ADMIN_URL,
    process.env.MINI_APP_URL,
    process.env.APP_URL,
    process.env.PUBLIC_APP_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    origins.add(normalizeOrigin(candidate));
  }

  if (process.env.NODE_ENV !== "production") {
    [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173",
      "http://localhost:5174",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
    ].forEach((origin) => origins.add(origin));
  }

  return Array.from(origins);
}

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  enableTelegramBot: parseBoolean(process.env.ENABLE_TELEGRAM_BOT),
  sessionTtlDays: parsePositiveInt("SESSION_TTL_DAYS", 30),
  allowDemoSeed: parseBoolean(process.env.ALLOW_DEMO_SEED),
  demoSeedPassword: process.env.DEMO_SEED_PASSWORD?.trim() || null,
  bootstrapSuperadminTelegramId: process.env.BOOTSTRAP_SUPERADMIN_TELEGRAM_ID?.trim() || null,
  bootstrapSuperadminName: process.env.BOOTSTRAP_SUPERADMIN_NAME?.trim() || null,
  bootstrapSuperadminPassword: process.env.BOOTSTRAP_SUPERADMIN_PASSWORD?.trim() || null,
  bootstrapSuperadminPasswordHash: process.env.BOOTSTRAP_SUPERADMIN_PASSWORD_HASH?.trim() || null,
  allowedCorsOrigins: collectAllowedOrigins(),
};

export function validateRuntimeEnv() {
  const missing: string[] = [];

  if (env.enableTelegramBot && !process.env.TELEGRAM_BOT_TOKEN) {
    missing.push("TELEGRAM_BOT_TOKEN");
  }

  if (!env.isProduction) {
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    missing.push("ANTHROPIC_API_KEY");
  }
  if (!process.env.PUBLIC_OBJECT_SEARCH_PATHS) {
    missing.push("PUBLIC_OBJECT_SEARCH_PATHS");
  }
  if (!process.env.PRIVATE_OBJECT_DIR) {
    missing.push("PRIVATE_OBJECT_DIR");
  }
  if (
    !hasAnyUrl(
      process.env.ADMIN_URL,
      process.env.APP_URL,
      process.env.PUBLIC_APP_URL,
      process.env.RAILWAY_PUBLIC_DOMAIN,
    )
  ) {
    missing.push("ADMIN_URL or APP_URL");
  }
  if (
    !hasAnyUrl(
      process.env.MINI_APP_URL,
      process.env.APP_URL,
      process.env.PUBLIC_APP_URL,
      process.env.RAILWAY_PUBLIC_DOMAIN,
    )
  ) {
    missing.push("MINI_APP_URL or APP_URL");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
