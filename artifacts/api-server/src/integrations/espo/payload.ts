import type { EspoLeadPayload } from "./types";

interface ClientLike {
  fullName?: string | null;
  phone?: string | null;
  externalUuid: string;
  legalName?: string | null;
  gender?: string | null;
  preferredLanguage?: string | null;
  clientType?: string | null;
  clientSegment?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  purpose?: string | null;
  desiredAmountUzs?: number | string | null;
  desiredTermMonths?: number | null;
  preferredCurrency?: string | null;
  branch?: { name?: string | null } | null;
  // Proxy for consent timestamp — clients can only be created with consent
  // accepted, so the row's createdAt is when the user agreed.
  createdAt?: Date | string | null;
}

// Mini-app's purpose enum. Anything outside this set is treated as free
// text (the "не уверен" path).
const KNOWN_PURPOSE = new Set(["working_capital", "fixed_assets", "untargeted"]);

// Mini-app value → human-readable label injected into Espo's free-text
// `loanPurposeOther` field. We do NOT push raw codes into Espo's
// `loanPurpose` Enum because we cannot guarantee the enum value names match
// without an explicit mapping; instead, every purpose lands in the Varchar
// field which Espo accepts unconditionally.
const PURPOSE_LABEL: Record<string, string> = {
  working_capital: "Оборотный капитал",
  fixed_assets:    "Основные средства",
  untargeted:      "Нецелевой",
};

function buildDescriptionBlock(c: ClientLike): string {
  const lines: string[] = [];
  if (c.branch?.name) lines.push(`Филиал: ${c.branch.name}`);
  if (c.gender) lines.push(`Пол: ${c.gender === "male" ? "мужской" : c.gender === "female" ? "женский" : c.gender}`);
  if (c.preferredLanguage) lines.push(`Язык: ${c.preferredLanguage.toUpperCase()}`);
  if (c.clientType) lines.push(`Тип клиента: ${c.clientType}`);
  if (c.clientSegment) lines.push(`Сегмент: ${c.clientSegment}`);
  if (c.latitude != null && c.longitude != null) {
    lines.push(`Координаты: ${c.latitude}, ${c.longitude}`);
  }
  if (c.createdAt) {
    const ts = c.createdAt instanceof Date
      ? c.createdAt.toISOString()
      : c.createdAt;
    lines.push(`Согласие подписано (момент регистрации): ${ts}`);
  }
  lines.push("", "Источник: Minerva mini-app");
  return lines.join("\n");
}

/**
 * Build the legacy minimal payload — name + phone + status + branch in
 * description. Used when ESPO_FULL_PAYLOAD is not set, matching the
 * pre-change behavior exactly so existing prod sync stays untouched.
 */
function buildMinimalPayload(client: ClientLike): EspoLeadPayload {
  const parts = (client.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
  return {
    firstName,
    lastName,
    fullName: client.fullName ?? undefined,
    phone: client.phone ?? undefined,
    status: "New",
    source: "Minerva",
    description: client.branch?.name ? `Branch: ${client.branch.name}` : undefined,
    cLocalLeadUuid: client.externalUuid,
  };
}

/**
 * Rich payload for ESPO_FULL_PAYLOAD=1. Maps every available mini-app
 * data point to the corresponding Espo Lead field per the agreed mapping:
 *   fullName        → leadName
 *   legalName       → leadAccountName (yuridik nomi)
 *   phone           → contactPhone (and also `phone` for legacy)
 *   branch.name     → branch (Enum, exact "code - name" string)
 *   purpose         → loanPurpose (if enum) OR loanPurposeOther (if free text)
 *   desiredAmountUzs→ requestedAmount
 *   preferredCurrency→ requestedAmountCurrency
 *   desiredTermMonths→ loanTermD
 *   gender, language, coords, segment → description (composed block)
 */
function buildRichPayload(client: ClientLike): EspoLeadPayload {
  const base = buildMinimalPayload(client);

  base.leadName = client.fullName ?? undefined;
  if (client.legalName) base.leadAccountName = client.legalName;
  if (client.phone) base.contactPhone = client.phone;
  if (client.branch?.name) base.branch = client.branch.name;

  if (client.purpose) {
    const p = client.purpose.trim();
    // Always populate the free-text field — safe regardless of Espo's
    // loanPurpose enum config. Use a human label for known values, raw
    // text otherwise.
    base.loanPurposeOther = (KNOWN_PURPOSE.has(p) ? PURPOSE_LABEL[p] : p).slice(0, 255);
  }

  if (client.desiredAmountUzs != null) {
    const n = typeof client.desiredAmountUzs === "string"
      ? Number.parseFloat(client.desiredAmountUzs)
      : client.desiredAmountUzs;
    if (Number.isFinite(n) && n > 0) base.requestedAmount = n;
  }

  if (client.preferredCurrency) {
    const c = client.preferredCurrency.toUpperCase();
    if (c === "UZS" || c === "USD" || c === "EUR" || c === "RUB") {
      base.requestedAmountCurrency = c;
    }
  }

  if (client.desiredTermMonths != null && Number.isInteger(client.desiredTermMonths)) {
    base.loanTermD = client.desiredTermMonths;
  }

  base.description = buildDescriptionBlock(client);

  return base;
}

/**
 * Public composer. Switches between minimal and rich payload via env flag
 * so the mapping can be enabled per-environment (start on staging, then
 * flip on prod after spot-checking a real lead).
 */
export function clientToEspoLead(client: ClientLike): EspoLeadPayload {
  if (process.env.ESPO_FULL_PAYLOAD === "1") {
    return buildRichPayload(client);
  }
  return buildMinimalPayload(client);
}
