import { describe, it, expect } from "vitest";
import { partitionRowActions, type RowAction } from "../components/row-actions";

const noop = () => {};

function action(label: string, opts: Partial<RowAction> = {}): RowAction {
  return { label, onClick: noop, ...opts };
}

describe("partitionRowActions", () => {
  it("returns empty groups when nothing visible", () => {
    expect(partitionRowActions([])).toEqual({ safe: [], dangerous: [] });
    expect(partitionRowActions([action("Edit", { hidden: true })])).toEqual({
      safe: [],
      dangerous: [],
    });
  });

  it("groups non-danger actions in safe", () => {
    const actions = [action("Edit"), action("View")];
    const { safe, dangerous } = partitionRowActions(actions);
    expect(safe).toHaveLength(2);
    expect(dangerous).toEqual([]);
  });

  it("isolates danger actions", () => {
    const actions = [
      action("Edit"),
      action("Delete", { danger: true }),
      action("Archive", { danger: true }),
    ];
    const { safe, dangerous } = partitionRowActions(actions);
    expect(safe.map((a) => a.label)).toEqual(["Edit"]);
    expect(dangerous.map((a) => a.label)).toEqual(["Delete", "Archive"]);
  });

  it("filters out hidden actions across both groups (permission gating)", () => {
    const actions = [
      action("Edit"),
      action("Edit (admin only)", { hidden: true }),
      action("Delete", { danger: true, hidden: true }),
      action("Archive", { danger: true }),
    ];
    const { safe, dangerous } = partitionRowActions(actions);
    expect(safe.map((a) => a.label)).toEqual(["Edit"]);
    expect(dangerous.map((a) => a.label)).toEqual(["Archive"]);
  });

  it("preserves the input order within each group", () => {
    const actions = [
      action("View"),
      action("Edit"),
      action("Hard delete", { danger: true }),
      action("Archive", { danger: true }),
    ];
    const { safe, dangerous } = partitionRowActions(actions);
    expect(safe.map((a) => a.label)).toEqual(["View", "Edit"]);
    expect(dangerous.map((a) => a.label)).toEqual(["Hard delete", "Archive"]);
  });
});
