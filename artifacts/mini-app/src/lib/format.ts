function resolveLocale(locale?: string) {
  return locale?.startsWith("uz") ? "uz-UZ" : "ru-RU";
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
  if (num === null) return value === null || value === undefined || value === "" ? "—" : String(value);
  return num.toLocaleString(resolveLocale(locale), { maximumFractionDigits: 2 });
}

export function fmtPercent(value: string | number | null | undefined, locale?: string): string {
  const raw = value === null || value === undefined ? "" : String(value).trim();
  if (!raw) return "—";

  const parsed = parseLooseNumber(raw);
  if (parsed === null) return raw;

  const percentValue = raw.includes("%") ? parsed : Math.abs(parsed) < 1 ? parsed * 100 : parsed;
  return `${percentValue.toLocaleString(resolveLocale(locale), { maximumFractionDigits: 2 })}%`;
}

export function formatIntegerInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

export function parseIntegerInput(value: string): number | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function fmtDate(date: string | Date | null | undefined, locale?: string): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(resolveLocale(locale), { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateTime(date: string | Date | null | undefined, locale?: string): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(resolveLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
