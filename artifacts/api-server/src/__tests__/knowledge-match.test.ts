import { describe, it, expect } from "vitest";
import { extractTags, matchKnowledgeDocs } from "../lib/knowledge-match";
import type { RecommendationDocument } from "@workspace/db";

function doc(overrides: Partial<RecommendationDocument> = {}): RecommendationDocument {
  return {
    id: 1,
    title: "Sample",
    body: "content",
    tags: "",
    isActive: true,
    sortOrder: 0,
    authorId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("extractTags", () => {
  it("splits CSV and lowercases", () => {
    expect(extractTags("Transport, >7y , Jewelry")).toEqual(["transport", ">7y", "jewelry"]);
  });

  it("returns empty for null/undefined/empty", () => {
    expect(extractTags(null)).toEqual([]);
    expect(extractTags(undefined)).toEqual([]);
    expect(extractTags("")).toEqual([]);
    expect(extractTags("   ")).toEqual([]);
  });
});

describe("matchKnowledgeDocs", () => {
  const docs = [
    doc({ id: 1, tags: "transport,small", title: "Transport for SMEs" }),
    doc({ id: 2, tags: "real_estate", title: "Real estate basics" }),
    doc({ id: 3, tags: "credit,working_capital", title: "Working capital tips" }),
    doc({ id: 4, tags: "transport", title: "Transport — archived", isActive: false }),
    doc({ id: 5, tags: "", title: "Untagged" }),
  ];

  it("returns docs whose tags match any keyword", () => {
    const result = matchKnowledgeDocs(docs, ["transport"]);
    expect(result.map((d) => d.id)).toEqual([1]);
  });

  it("ignores inactive docs even on tag match", () => {
    const result = matchKnowledgeDocs(docs, ["transport"]);
    expect(result.map((d) => d.id)).not.toContain(4);
  });

  it("matches case-insensitively", () => {
    const result = matchKnowledgeDocs(docs, ["TRANSPORT", "Small"]);
    expect(result.map((d) => d.id)).toContain(1);
  });

  it("returns empty array when no keywords given", () => {
    expect(matchKnowledgeDocs(docs, [])).toEqual([]);
    expect(matchKnowledgeDocs(docs, [null, undefined, ""])).toEqual([]);
  });

  it("matches multiple keywords (any-of, not all-of)", () => {
    const result = matchKnowledgeDocs(docs, ["working_capital"]);
    expect(result.map((d) => d.id)).toEqual([3]);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      doc({ id: i + 1, tags: "transport", title: `Transport doc ${i}` }),
    );
    const result = matchKnowledgeDocs(many, ["transport"], 3);
    expect(result).toHaveLength(3);
  });

  it("uses exact-tag match, not substring", () => {
    // "transport-old" should NOT match keyword "transport"
    const tagged = [doc({ id: 99, tags: "transport-old", title: "Variant" })];
    expect(matchKnowledgeDocs(tagged, ["transport"])).toEqual([]);
    // But explicit match works
    expect(matchKnowledgeDocs(tagged, ["transport-old"]).map((d) => d.id)).toEqual([99]);
  });
});
