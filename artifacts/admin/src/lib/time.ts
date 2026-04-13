export const APP_TIME_ZONE = "Asia/Tashkent";

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput = new Date()) {
  if (value instanceof Date) return value;
  return new Date(value ?? Date.now());
}

function getParts(value: DateInput = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(toDate(value));

  const read = (type: string) => parts.find((part) => part.type === type)?.value || "00";

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

export function formatAdminShortDate(value: DateInput) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(toDate(value));
}

export function formatAdminLongDate(value: DateInput) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(toDate(value));
}

export function formatAdminMonthYear(value: DateInput) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    month: "short",
    year: "numeric",
  }).format(toDate(value));
}

export function formatAdminDateTime(value: DateInput) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(toDate(value));
}

export function formatAdminFileDate(value: DateInput = new Date()) {
  const { year, month, day } = getParts(value);
  return `${year}-${month}-${day}`;
}

export function formatAdminFileDateTime(value: DateInput = new Date()) {
  const { year, month, day, hour, minute, second } = getParts(value);
  return `${year}-${month}-${day}_${hour}${minute}${second}`;
}
