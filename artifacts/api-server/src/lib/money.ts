/**
 * Shared money helpers for the api-server.
 *
 * - `roundMoney(value)` rounds to 2 decimals with classic half-up behaviour.
 *   The implementation nudges by `Number.EPSILON` before rounding so that
 *   values like `1.005` round to `1.01` instead of falling victim to the
 *   `100.49999999999999` floating-point trap. All currency math should go
 *   through here so totals stay byte-identical between the calculator,
 *   collateral, and PDF leave-behind paths.
 *
 * - `formatUzs(value, opts?)` formats a numeric value for display in the
 *   ru-RU locale with no fractional digits, e.g. `1 234 567`. When
 *   `opts.withSymbol` is true the string is suffixed with ` UZS`.
 *
 * Locale is intentionally locked to `ru-RU` for now -- it matches the
 * thousands-separator convention used across the legacy PDFs and admin UI.
 * Branding/locale will become config-driven in a later wave; see
 * `docs/SELLABILITY-ROADMAP.md` (multi-tenant branding note) before promoting
 * this helper to support per-bank locales.
 */

/**
 * Rounds a numeric currency value to 2 decimal places (half-up).
 * Returns `0` when the input is not finite (NaN, +/-Infinity).
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Math.round on its own loses the 1.005 case to FP error; the EPSILON
  // nudge restores classic half-up rounding without breaking existing rounded
  // values (123.45 stays 123.45, etc.).
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const UZS_FORMATTER = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export interface FormatUzsOptions {
  /** When true, appends ` UZS` to the formatted number. Defaults to false. */
  withSymbol?: boolean;
}

/**
 * Formats a money value using `Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })`.
 *
 * - `null` and `undefined` return an empty string `""` (the calling sites
 *   render this as `-` themselves when needed).
 * - Non-finite numbers (NaN, +/-Infinity) also return `""`.
 * - `bigint` values are passed straight to the formatter.
 *
 * @param value money value in UZS (or convertible to one)
 * @param opts  optional formatting flags
 */
export function formatUzs(
  value: number | bigint | null | undefined,
  opts?: FormatUzsOptions,
): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && !Number.isFinite(value)) return "";
  const formatted = UZS_FORMATTER.format(value);
  return opts?.withSymbol ? `${formatted} UZS` : formatted;
}
