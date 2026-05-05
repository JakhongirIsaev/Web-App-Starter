import { describe, it, expect, beforeEach } from "vitest";
import { getEspoClient, _resetEspoClientForTests } from "../integrations/espo/client";

describe("getEspoClient", () => {
  beforeEach(() => {
    _resetEspoClientForTests();
    delete process.env.ESPO_INTEGRATION;
    delete process.env.ESPO_BASE_URL;
    delete process.env.ESPO_API_KEY;
  });

  it("defaults to stub when ESPO_INTEGRATION unset", async () => {
    const c = getEspoClient();
    const r = await c.createLead({ cLocalLeadUuid: "abc-123", fullName: "X" }, "abc-123");
    expect(r.id).toBe("stub-abc-123");
    expect(r.cLocalLeadUuid).toBe("abc-123");
  });

  it("stub findLeadByLocalUuid returns null", async () => {
    const c = getEspoClient();
    expect(await c.findLeadByLocalUuid("any")).toBeNull();
  });

  it("throws if live without creds", () => {
    process.env.ESPO_INTEGRATION = "live";
    expect(() => getEspoClient()).toThrow(/ESPO_BASE_URL/);
  });

  it("returns same singleton across calls", () => {
    const a = getEspoClient();
    const b = getEspoClient();
    expect(a).toBe(b);
  });
});
