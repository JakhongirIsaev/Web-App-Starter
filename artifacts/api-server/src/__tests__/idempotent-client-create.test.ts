import { describe, it, expect } from "vitest";
import { MiniAppCreateClientBody } from "@workspace/api-zod";

/*
 * Phase D1 followup — server-side idempotency for the offline queue.
 *
 * The mini-app injects an externalUuid into the body before the first POST
 * attempt and replays the same body on reconnect. The schema must accept the
 * field as an optional UUID, and must continue to accept bodies that omit it
 * (legacy callers, server-side flows, and any future caller that doesn't
 * care about offline idempotency).
 *
 * Wire-level conflict behaviour (ON CONFLICT DO NOTHING + RETURNING) is
 * exercised by integration tests with a real DB; these are pure schema
 * smoke tests with no DB dependency.
 */
describe("MiniAppCreateClientBody externalUuid", () => {
  it("accepts a uuid", () => {
    const result = MiniAppCreateClientBody.safeParse({
      fullName: "Test",
      phone: "+998 90 000-00-00",
      externalUuid: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("works without externalUuid (optional, backward compatible)", () => {
    const result = MiniAppCreateClientBody.safeParse({
      fullName: "Test",
      phone: "+998 90 000-00-00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid string", () => {
    const result = MiniAppCreateClientBody.safeParse({
      fullName: "Test",
      externalUuid: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});
