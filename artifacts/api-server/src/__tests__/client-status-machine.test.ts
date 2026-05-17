import { describe, it, expect } from "vitest";
import {
  isAllowedStatusTransition,
  isApplicationFrozen,
  describeTransition,
} from "../lib/client-status-machine";

describe("isAllowedStatusTransition", () => {
  it("allows the canonical forward path", () => {
    expect(isAllowedStatusTransition("draft", "lead")).toBe(true);
    expect(isAllowedStatusTransition("lead", "recommendation")).toBe(true);
    expect(isAllowedStatusTransition("recommendation", "basket")).toBe(true);
    expect(isAllowedStatusTransition("basket", "pdf_generated")).toBe(true);
    expect(isAllowedStatusTransition("pdf_generated", "under_review")).toBe(true);
    expect(isAllowedStatusTransition("under_review", "approved")).toBe(true);
    expect(isAllowedStatusTransition("approved", "completed")).toBe(true);
  });

  it("allows recommendation → pdf_generated (basket-skipping lead flow, 2026-05-09)", () => {
    expect(isAllowedStatusTransition("recommendation", "pdf_generated")).toBe(true);
  });

  it("allows under_review → rejected", () => {
    expect(isAllowedStatusTransition("under_review", "rejected")).toBe(true);
  });

  it("allows limited backwards moves for re-quoting", () => {
    expect(isAllowedStatusTransition("recommendation", "lead")).toBe(true);
    expect(isAllowedStatusTransition("basket", "recommendation")).toBe(true);
    expect(isAllowedStatusTransition("pdf_generated", "basket")).toBe(true);
  });

  it("blocks jump from draft to approved", () => {
    expect(isAllowedStatusTransition("draft", "approved")).toBe(false);
  });

  it("blocks jump from lead to pdf_generated", () => {
    expect(isAllowedStatusTransition("lead", "pdf_generated")).toBe(false);
  });

  it("blocks resurrecting completed clients", () => {
    expect(isAllowedStatusTransition("completed", "draft")).toBe(false);
    expect(isAllowedStatusTransition("completed", "approved")).toBe(false);
  });

  it("blocks re-opening rejected clients", () => {
    expect(isAllowedStatusTransition("rejected", "under_review")).toBe(false);
    expect(isAllowedStatusTransition("rejected", "approved")).toBe(false);
  });

  it("blocks bypassing under_review", () => {
    expect(isAllowedStatusTransition("pdf_generated", "approved")).toBe(false);
    expect(isAllowedStatusTransition("basket", "approved")).toBe(false);
  });

  it("treats no-op as allowed", () => {
    expect(isAllowedStatusTransition("lead", "lead")).toBe(true);
    expect(isAllowedStatusTransition("approved", "approved")).toBe(true);
  });
});

describe("isApplicationFrozen", () => {
  it("freezes after PDF was generated", () => {
    expect(isApplicationFrozen("pdf_generated")).toBe(true);
    expect(isApplicationFrozen("under_review")).toBe(true);
    expect(isApplicationFrozen("approved")).toBe(true);
    expect(isApplicationFrozen("completed")).toBe(true);
    expect(isApplicationFrozen("rejected")).toBe(true);
  });

  it("does not freeze pre-PDF stages", () => {
    expect(isApplicationFrozen("draft")).toBe(false);
    expect(isApplicationFrozen("lead")).toBe(false);
    expect(isApplicationFrozen("recommendation")).toBe(false);
    expect(isApplicationFrozen("basket")).toBe(false);
  });
});

describe("describeTransition", () => {
  it("returns no-op for same status", () => {
    expect(describeTransition("lead", "lead")).toBe("no-op");
  });

  it("returns allowed for valid transitions", () => {
    expect(describeTransition("lead", "recommendation")).toBe("allowed");
  });

  it("returns descriptive failure for invalid transitions", () => {
    expect(describeTransition("draft", "approved")).toContain("not allowed");
    expect(describeTransition("draft", "approved")).toContain("draft");
    expect(describeTransition("draft", "approved")).toContain("approved");
  });
});
