import { describe, it, expect } from "vitest";
import { z } from "zod/v4";

// Copied from routes/recommendation-documents.ts — schemas are defined inline
// in the route file, so we replicate them here for unit testing.
const CreateDocumentBody = z.object({
  title: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
  tags: z.string().max(500).optional().default(""),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).max(100000).optional().default(0),
});

const UpdateDocumentBody = z.object({
  title: z.string().min(1).max(300).optional(),
  body: z.string().min(1).max(20000).optional(),
  tags: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});

describe("CreateDocumentBody", () => {
  it("accepts a valid payload with all fields", () => {
    const r = CreateDocumentBody.safeParse({
      title: "Как оформить кредит",
      body: "Подробное описание процесса оформления кредита.",
      tags: "credit,howto",
      isActive: false,
      sortOrder: 50,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.title).toBe("Как оформить кредит");
      expect(r.data.isActive).toBe(false);
      expect(r.data.sortOrder).toBe(50);
    }
  });

  it("accepts a minimal payload (only required fields) and applies defaults", () => {
    const r = CreateDocumentBody.safeParse({
      title: "A",
      body: "B",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tags).toBe("");
      expect(r.data.isActive).toBe(true);
      expect(r.data.sortOrder).toBe(0);
    }
  });

  it("rejects missing title", () => {
    const r = CreateDocumentBody.safeParse({ body: "content" });
    expect(r.success).toBe(false);
  });

  it("rejects missing body", () => {
    const r = CreateDocumentBody.safeParse({ title: "Title" });
    expect(r.success).toBe(false);
  });

  it("rejects empty title (min 1)", () => {
    const r = CreateDocumentBody.safeParse({ title: "", body: "content" });
    expect(r.success).toBe(false);
  });

  it("rejects empty body (min 1)", () => {
    const r = CreateDocumentBody.safeParse({ title: "Title", body: "" });
    expect(r.success).toBe(false);
  });

  it("accepts title at max length (300 chars)", () => {
    const r = CreateDocumentBody.safeParse({
      title: "x".repeat(300),
      body: "content",
    });
    expect(r.success).toBe(true);
  });

  it("rejects title exceeding max length (301 chars)", () => {
    const r = CreateDocumentBody.safeParse({
      title: "x".repeat(301),
      body: "content",
    });
    expect(r.success).toBe(false);
  });

  it("accepts body at max length (20000 chars)", () => {
    const r = CreateDocumentBody.safeParse({
      title: "Title",
      body: "y".repeat(20000),
    });
    expect(r.success).toBe(true);
  });

  it("rejects body exceeding max length (20001 chars)", () => {
    const r = CreateDocumentBody.safeParse({
      title: "Title",
      body: "y".repeat(20001),
    });
    expect(r.success).toBe(false);
  });

  it("accepts tags at max length (500 chars)", () => {
    const r = CreateDocumentBody.safeParse({
      title: "T",
      body: "B",
      tags: "t".repeat(500),
    });
    expect(r.success).toBe(true);
  });

  it("rejects tags exceeding max length (501 chars)", () => {
    const r = CreateDocumentBody.safeParse({
      title: "T",
      body: "B",
      tags: "t".repeat(501),
    });
    expect(r.success).toBe(false);
  });

  it("rejects sortOrder below 0", () => {
    const r = CreateDocumentBody.safeParse({
      title: "T",
      body: "B",
      sortOrder: -1,
    });
    expect(r.success).toBe(false);
  });

  it("rejects sortOrder above 100000", () => {
    const r = CreateDocumentBody.safeParse({
      title: "T",
      body: "B",
      sortOrder: 100001,
    });
    expect(r.success).toBe(false);
  });

  it("accepts sortOrder at boundaries (0 and 100000)", () => {
    const r0 = CreateDocumentBody.safeParse({ title: "T", body: "B", sortOrder: 0 });
    expect(r0.success).toBe(true);

    const rMax = CreateDocumentBody.safeParse({ title: "T", body: "B", sortOrder: 100000 });
    expect(rMax.success).toBe(true);
  });

  it("rejects non-integer sortOrder", () => {
    const r = CreateDocumentBody.safeParse({
      title: "T",
      body: "B",
      sortOrder: 1.5,
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-boolean isActive", () => {
    const r = CreateDocumentBody.safeParse({
      title: "T",
      body: "B",
      isActive: "yes",
    });
    expect(r.success).toBe(false);
  });
});

describe("UpdateDocumentBody", () => {
  it("accepts an empty payload (all fields optional)", () => {
    const r = UpdateDocumentBody.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts a partial update with only title", () => {
    const r = UpdateDocumentBody.safeParse({ title: "New title" });
    expect(r.success).toBe(true);
  });

  it("accepts a partial update with only isActive", () => {
    const r = UpdateDocumentBody.safeParse({ isActive: false });
    expect(r.success).toBe(true);
  });

  it("rejects empty title when provided (min 1)", () => {
    const r = UpdateDocumentBody.safeParse({ title: "" });
    expect(r.success).toBe(false);
  });

  it("rejects empty body when provided (min 1)", () => {
    const r = UpdateDocumentBody.safeParse({ body: "" });
    expect(r.success).toBe(false);
  });

  it("rejects title exceeding max length", () => {
    const r = UpdateDocumentBody.safeParse({ title: "x".repeat(301) });
    expect(r.success).toBe(false);
  });

  it("rejects body exceeding max length", () => {
    const r = UpdateDocumentBody.safeParse({ body: "y".repeat(20001) });
    expect(r.success).toBe(false);
  });

  it("rejects sortOrder below 0", () => {
    const r = UpdateDocumentBody.safeParse({ sortOrder: -1 });
    expect(r.success).toBe(false);
  });

  it("rejects sortOrder above 100000", () => {
    const r = UpdateDocumentBody.safeParse({ sortOrder: 100001 });
    expect(r.success).toBe(false);
  });

  it("rejects non-integer sortOrder", () => {
    const r = UpdateDocumentBody.safeParse({ sortOrder: 99.9 });
    expect(r.success).toBe(false);
  });

  it("accepts a full update with all fields", () => {
    const r = UpdateDocumentBody.safeParse({
      title: "Updated",
      body: "Updated body",
      tags: "new,tags",
      isActive: true,
      sortOrder: 999,
    });
    expect(r.success).toBe(true);
  });
});
