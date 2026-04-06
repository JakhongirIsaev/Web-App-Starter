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

function getEmptyPlaceholder() {
  return "—";
}

export function fmtNum(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return getEmptyPlaceholder();
  }

  const numericValue = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(numericValue)) return String(value);

  return numericValue.toLocaleString(getLocale(), {
    maximumFractionDigits: 2,
  });
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
