// Espo Lead entity fields. Most are optional — `cLocalLeadUuid` is the only
// required one because we use it for idempotency. `[key: string]: unknown`
// at the end lets the rich-payload composer set any custom Espo field
// (e.g. `cBranchCode`) without bloating this type.
export interface EspoLeadPayload {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
  status?: string; // "New" | "Assigned" | ...
  source?: string;
  description?: string;
  assignedUserId?: string;

  // Native Espo Lead fields populated by the rich payload (when
  // ESPO_FULL_PAYLOAD=1). Each is optional — Espo accepts partial payloads.
  leadName?: string;             // ФИО клиента
  leadAccountName?: string;      // Указанное наименование организации (yuridik nomi)
  contactPhone?: string;         // Контактный номер
  branch?: string;               // Филиал (Enum value, e.g. "00444 - ОПЕРУ")
  loanPurpose?: string;          // Цель кредита (Enum)
  loanPurposeOther?: string;     // Другая цель кредитования (Varchar — used when purpose is free text)
  requestedAmount?: number;      // Сумма кредита
  requestedAmountCurrency?: string; // UZS | USD | EUR | RUB
  loanTermD?: number;            // Срок кредита, месяцев

  // Custom field — defends against Espo not honoring an idempotency header
  // by carrying the local UUID into Espo so duplicates can be detected.
  cLocalLeadUuid: string;

  // Allow arbitrary additional fields. Lets the field map evolve via env
  // without code changes (e.g. ESPO_FIELD_MAP_EXTRA={"cFoo": "bar"}).
  [key: string]: unknown;
}

export interface EspoLeadResponse {
  id: string;
  name?: string;
  status?: string;
  cLocalLeadUuid?: string;
}

export interface EspoClient {
  createLead(p: EspoLeadPayload, idempotencyKey: string): Promise<EspoLeadResponse>;
  findLeadByLocalUuid(localUuid: string): Promise<EspoLeadResponse | null>;
  listRecentLeads(since: Date): Promise<EspoLeadResponse[]>;
}
