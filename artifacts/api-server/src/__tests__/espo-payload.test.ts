import { describe, it, expect } from "vitest";
import { clientToEspoLead } from "../integrations/espo/payload";

describe("clientToEspoLead", () => {
  it("splits fullName into first/last", () => {
    const p = clientToEspoLead({
      externalUuid: "uuid-1",
      fullName: "Aziz Karimov",
      phone: "+998 90 123-45-67",
      branch: { name: "Chilonzor" },
    });
    expect(p.firstName).toBe("Aziz");
    expect(p.lastName).toBe("Karimov");
    expect(p.phone).toBe("+998 90 123-45-67");
    expect(p.cLocalLeadUuid).toBe("uuid-1");
    expect(p.source).toBe("Minerva");
    expect(p.description).toBe("Branch: Chilonzor");
  });

  it("handles single-name", () => {
    const p = clientToEspoLead({ externalUuid: "u2", fullName: "Anonymous" });
    expect(p.firstName).toBe("Anonymous");
    expect(p.lastName).toBeUndefined();
  });

  it("handles missing fullName", () => {
    const p = clientToEspoLead({ externalUuid: "u3" });
    expect(p.firstName).toBeUndefined();
    expect(p.lastName).toBeUndefined();
    expect(p.cLocalLeadUuid).toBe("u3");
  });

  it("handles missing branch", () => {
    const p = clientToEspoLead({ externalUuid: "u4", fullName: "X Y" });
    expect(p.description).toBeUndefined();
  });
});
