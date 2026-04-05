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

export function fmtNum(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "вЂ”";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);
  return num.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

export function fmtDate(date: string | Date | null | undefined): string {
  if (!date) return "вЂ”";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ru-RU", {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function fmtDateTime(date: string | Date | null | undefined): string {
  if (!date) return "вЂ”";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ru-RU", {
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

export function getTashkentDateByMonthOffset(monthOffset: number, from: DateInput = new Date()) {
  const { year, month, day } = getAppClockParts(from);
  return new Date(Date.UTC(year, month + monthOffset, day) - APP_TIME_ZONE_OFFSET_MS);
}
