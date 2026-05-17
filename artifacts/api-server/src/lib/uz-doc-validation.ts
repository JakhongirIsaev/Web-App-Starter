// Format-level validation for fields commonly extracted from scanned docs in
// Uzbekistan. These checks catch the dominant OCR-error class — wrong digit
// count, stray letters, missing prefix — without claiming to verify the
// document against any registry. Every helper is pure (no I/O) and returns
// `{ valid, normalized, reason }` so the caller can persist a `requiresReview`
// flag alongside the raw OCR value.

export interface FieldValidationResult {
  valid: boolean;
  normalized?: string;
  reason?: string;
}

const STIR_RE = /^\d{9}$/;
// UZ passport: two letters (Latin AA-ZZ or Cyrillic АА-ЯЯ) + 7 digits, e.g. AA1234567 or АА1234567.
const PASSPORT_RE = /^([A-Z]{2}|[А-Я]{2})\d{7}$/;
// UZ phone canonical form: +998 XX XXX-XX-XX (12 digits incl. country code).
const PHONE_DIGITS_LEN = 12;
const PHONE_PREFIX = "998";

const stripWhitespace = (value: string) => value.replace(/[\s \-_().]/g, "");

/**
 * STIR (ИНН Юридического лица) — 9-digit Uzbek tax ID.
 * Format-only check. Checksum verification omitted until we have a verified
 * algorithm reference; a 9-digit string already filters out 95%+ of OCR
 * errors (5/8/3 digit reads, letter substitutions, etc).
 */
export function validateStir(raw: string | null | undefined): FieldValidationResult {
  if (!raw) return { valid: false, reason: "empty" };
  const cleaned = stripWhitespace(raw);
  if (!STIR_RE.test(cleaned)) {
    return { valid: false, normalized: cleaned, reason: "expected_9_digits" };
  }
  return { valid: true, normalized: cleaned };
}

/**
 * Uzbek passport — 2 Cyrillic/Latin letters + 7 digits.
 * Normalizes to uppercase; collapses whitespace.
 */
export function validatePassport(raw: string | null | undefined): FieldValidationResult {
  if (!raw) return { valid: false, reason: "empty" };
  const cleaned = stripWhitespace(raw).toUpperCase();
  if (!PASSPORT_RE.test(cleaned)) {
    return { valid: false, normalized: cleaned, reason: "expected_aa1234567" };
  }
  return { valid: true, normalized: cleaned };
}

/**
 * UZ phone normalization: accept "+998XXXXXXXXX", "998XXXXXXXXX",
 * "0XXXXXXXXX", or "XXXXXXXXX" (9-digit local). Strips spaces, dashes,
 * parens. Returns canonical "+998XXXXXXXXX" form when valid.
 */
export function validateUzPhone(raw: string | null | undefined): FieldValidationResult {
  if (!raw) return { valid: false, reason: "empty" };
  let digits = stripWhitespace(raw).replace(/^\+/, "");
  if (digits.length === 9) digits = PHONE_PREFIX + digits;
  if (digits.length === 10 && digits.startsWith("0")) digits = PHONE_PREFIX + digits.slice(1);
  if (digits.length !== PHONE_DIGITS_LEN || !digits.startsWith(PHONE_PREFIX) || !/^\d+$/.test(digits)) {
    return { valid: false, normalized: digits, reason: "expected_uz_phone" };
  }
  return { valid: true, normalized: `+${digits}` };
}

/**
 * Apply format checks to the JSON blob the OCR pipeline saved on a
 * client_documents row. Returns a new object with normalized fields and an
 * `_invalidFields` array listing keys that failed validation, so the UI can
 * surface "needs review" hints without losing the raw value.
 */
export function validateExtractedData(
  data: Record<string, unknown> | null | undefined,
): { sanitized: Record<string, unknown>; invalidFields: string[] } {
  if (!data || typeof data !== "object") return { sanitized: {}, invalidFields: [] };
  const out: Record<string, unknown> = { ...data };
  const invalid: string[] = [];

  const apply = (key: string, fn: (raw: string) => FieldValidationResult) => {
    const raw = data[key];
    if (typeof raw !== "string" || !raw.trim()) return;
    const result = fn(raw);
    if (result.valid) {
      if (result.normalized) out[key] = result.normalized;
    } else {
      invalid.push(key);
    }
  };

  apply("inn", validateStir);
  apply("stir", validateStir);
  apply("passportNumber", validatePassport);
  apply("phone", validateUzPhone);

  return { sanitized: out, invalidFields: invalid };
}
