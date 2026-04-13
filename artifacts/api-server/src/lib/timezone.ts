export const APP_TIME_ZONE = "Asia/Tashkent";

// Uzbekistan is UTC+5 year-round, so fixed-offset boundaries stay stable.
const APP_TIME_ZONE_OFFSET_MS = 5 * 60 * 60 * 1000;

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput = new Date()) {
  if (value instanceof Date) return value;
  return new Date(value ?? Date.now());
}

function getAppClockParts(value: DateInput = new Date()) {
  const shifted = new Date(toDate(value).getTime() + APP_TIME_ZONE_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

export function startOfAppDay(value: DateInput = new Date()) {
  const { year, month, day } = getAppClockParts(value);
  return new Date(Date.UTC(year, month, day) - APP_TIME_ZONE_OFFSET_MS);
}

export function startOfAppMonth(value: DateInput = new Date()) {
  const { year, month } = getAppClockParts(value);
  return new Date(Date.UTC(year, month, 1) - APP_TIME_ZONE_OFFSET_MS);
}

export function formatDateInAppTimeZone(
  value: DateInput,
  locale = "uz-UZ",
  options: Intl.DateTimeFormatOptions = {},
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...options,
  }).format(toDate(value));
}

export function formatDateTimeInAppTimeZone(
  value: DateInput,
  locale = "uz-UZ",
  options: Intl.DateTimeFormatOptions = {},
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(toDate(value));
}

export function formatFileDate(value: DateInput = new Date()) {
  const { year, month, day } = getAppClockParts(value);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getAppYear(value: DateInput = new Date()) {
  return getAppClockParts(value).year;
}
