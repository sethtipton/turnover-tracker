import { describe, expect, it } from "vitest";
import { selectRelevantHistory } from "../supabase/functions/_shared/maintenance-history.ts";

const candidate = (overrides) => ({
  source_id: "source-1",
  source_type: "work_item",
  scope: "unit",
  title: "Bathroom exhaust fan inspection",
  detail: "Completed after a rattling noise report. Airflow was checked.",
  occurred_at: "2026-07-01T00:00:00Z",
  ...overrides,
});

describe("maintenance history retrieval", () => {
  it("keeps relevant same-unit history with provenance", () => {
    const history = selectRelevantHistory("Bathroom fan is rattling again", [candidate({ source_id: "fan-work" })]);
    expect(history).toEqual([expect.objectContaining({ source_id: "fan-work", source_type: "work_item", scope: "unit" })]);
  });

  it("excludes unrelated same-unit work", () => {
    const history = selectRelevantHistory("Bathroom fan is rattling", [candidate({ title: "Replace bedroom blinds", detail: "New blinds installed." })]);
    expect(history).toEqual([]);
  });

  it("includes relevant property-wide systems work", () => {
    const history = selectRelevantHistory("Water is leaking under the bathroom faucet", [candidate({ source_id: "water-main", scope: "property", title: "Water main plumbing repair", detail: "Property-wide plumbing repair was completed." })]);
    expect(history[0]).toMatchObject({ source_id: "water-main", scope: "property" });
  });

  it("does not select candidates representing another unit", () => {
    // The Edge query deliberately never fetches other-unit candidates; this
    // pure selector still rejects them when no direct request relevance exists.
    const history = selectRelevantHistory("Bathroom fan is rattling", [candidate({ source_id: "other-unit", scope: "property", title: "Unit 203 appliance replacement", detail: "Refrigerator replaced." })]);
    expect(history).toEqual([]);
  });

  it("bounds selected context", () => {
    const history = selectRelevantHistory("Bathroom fan rattling", Array.from({ length: 12 }, (_, index) => candidate({ source_id: `fan-${index}` })));
    expect(history).toHaveLength(8);
  });
});
