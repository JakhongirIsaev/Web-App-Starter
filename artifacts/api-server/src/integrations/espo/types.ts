export interface EspoLeadPayload {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
  status?: string; // "New" | "Assigned" | ...
  source?: string;
  description?: string;
  assignedUserId?: string;
  // Custom field — defends against Espo not honoring an idempotency header
  // by carrying the local UUID into Espo so duplicates can be detected.
  cLocalLeadUuid: string;
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
