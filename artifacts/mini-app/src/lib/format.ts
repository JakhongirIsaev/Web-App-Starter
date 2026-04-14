export const APP_TIME_ZONE = "Asia/Tashkent";

// Uzbekistan is UTC+5 year-round, so fixed-offset client-side helpers stay stable.
const APP_TIME_ZONE_OFFSET_MS = 5 * 60 * 60 * 1000;

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput = new Date()): Date {
  if (value instanceof Date) return value;
  return new Date(value ?? Date.now());
}

function getAppClockParts(value: DateInput = new Date()) {
  const shifted = new Date(toDate(value).getTime() + APP_TIME_ZONE_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function getMiniAppLanguage() {
  if (typeof window === "undefined") return "uz";
  return localStorage.getItem("minerva_miniapp_lang") === "ru" ? "ru" : "uz";
}

function getLocale() {
  return getMiniAppLanguage() === "ru" ? "ru-RU" : "uz-UZ";
}

function resolveLocale(override?: string) {
  if (!override) return getLocale();
  return override.startsWith("uz") ? "uz-UZ" : "ru-RU";
}

function getEmptyPlaceholder() {
  return "—";
}

function parseLooseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const normalized = value
    .trim()
    .replace(/\u00A0/g, "")
    .replace(/\s+/g, "")
    .replace(/%$/, "")
    .replace(/,/g, ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function fmtNum(value: string | number | null | undefined, locale?: string): string {
  const num = parseLooseNumber(value);
  if (num === null) {
    return value === null || value === undefined || value === "" ? getEmptyPlaceholder() : String(value);
  }
  return num.toLocaleString(resolveLocale(locale), { maximumFractionDigits: 2 });
}

export function fmtPercent(value: string | number | null | undefined, locale?: string): string {
  const raw = value === null || value === undefined ? "" : String(value).trim();
  if (!raw) return getEmptyPlaceholder();

  const parsed = parseLooseNumber(raw);
  if (parsed === null) return raw;

  const percentValue = raw.includes("%") ? parsed : Math.abs(parsed) < 1 ? parsed * 100 : parsed;
  return `${percentValue.toLocaleString(resolveLocale(locale), { maximumFractionDigits: 2 })}%`;
}

export function fmtDate(date: string | Date | null | undefined): string {
  if (!date) return getEmptyPlaceholder();
  const parsedDate = typeof date === "string" ? new Date(date) : date;
  return parsedDate.toLocaleDateString(getLocale(), {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function fmtDateTime(date: string | Date | null | undefined): string {
  if (!date) return getEmptyPlaceholder();
  const parsedDate = typeof date === "string" ? new Date(date) : date;
  return parsedDate.toLocaleDateString(getLocale(), {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatFileDate(date: DateInput = new Date()) {
  const { year, month, day } = getAppClockParts(date);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getTashkentDateByMonthOffset(
  monthOffset: number,
  from: DateInput = new Date(),
) {
  const { year, month, day } = getAppClockParts(from);
  return new Date(Date.UTC(year, month + monthOffset, day) - APP_TIME_ZONE_OFFSET_MS);
}
