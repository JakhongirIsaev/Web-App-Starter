import { db } from "@workspace/db";
import { clientsTable, type ClientStatus } from "@workspace/db";
import { eq } from "drizzle-orm";

// 2026-05-09: lead-onboarding flow is product-agnostic for now.
// `recommendation → pdf_generated` skips the (currently hidden) basket step
// so the credit expert can hand a leave-behind PDF straight after capturing
// the client's wishes (purpose, amount, term, currency).
const ALLOWED_TRANSITIONS: Record<ClientStatus, readonly ClientStatus[]> = {
  draft: ["draft", "lead", "recommendation"],
  lead: ["lead", "recommendation"],
  recommendation: ["recommendation", "basket", "lead", "pdf_generated"],
  basket: ["basket", "pdf_generated", "recommendation"],
  pdf_generated: ["pdf_generated", "under_review", "basket", "recommendation"],
  under_review: ["under_review", "approved", "rejected"],
  approved: ["approved", "completed"],
  completed: ["completed"],
  rejected: ["rejected"],
};

// Statuses past the "PDF was already handed to the client" line.
// Editing the credit application after this is treated as a re-quote and
// requires an explicit status rollback first.
const FROZEN_APPLICATION_STATUSES: readonly ClientStatus[] = [
  "pdf_generated",
  "under_review",
  "approved",
  "completed",
  "rejected",
];

export function isAllowedStatusTransition(
  from: ClientStatus,
  to: ClientStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function describeTransition(from: ClientStatus, to: ClientStatus): string {
  if (from === to) return "no-op";
  if (isAllowedStatusTransition(from, to)) return "allowed";
  return `not allowed: ${from} → ${to}`;
}

export function isApplicationFrozen(status: ClientStatus): boolean {
  return FROZEN_APPLICATION_STATUSES.includes(status);
}

export class StatusTransitionError extends Error {
  readonly from: ClientStatus;
  readonly to: ClientStatus;
  constructor(from: ClientStatus, to: ClientStatus) {
    super(`Status transition not allowed: ${from} → ${to}`);
    this.name = "StatusTransitionError";
    this.from = from;
    this.to = to;
  }
}

/**
 * Centralised status update — validates the transition graph before writing.
 * Use this in every place that needs to change `clients.status` so the state
 * machine stays the single source of truth.
 *
 * Returns the updated row, or null if the client doesn't exist.
 * Throws StatusTransitionError when the transition is rejected.
 */
export async function transitionClientStatus(
  clientId: number,
  to: ClientStatus,
  extraUpdates: Partial<typeof clientsTable.$inferInsert> = {},
) {
  const [current] = await db
    .select({ status: clientsTable.status })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);
  if (!current) return null;

  const from = current.status as ClientStatus;
  if (!isAllowedStatusTransition(from, to)) {
    throw new StatusTransitionError(from, to);
  }

  const [updated] = await db
    .update(clientsTable)
    .set({ ...extraUpdates, status: to, updatedAt: new Date() })
    .where(eq(clientsTable.id, clientId))
    .returning();
  return updated;
}
