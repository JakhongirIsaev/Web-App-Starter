import type { EspoLeadPayload } from "./types";

interface ClientLike {
  fullName?: string | null;
  phone?: string | null;
  externalUuid: string;
  branch?: { name?: string | null } | null;
}

export function clientToEspoLead(client: ClientLike): EspoLeadPayload {
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
