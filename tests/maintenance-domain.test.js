import { describe, expect, it } from "vitest";
import {
  getMaintenanceStatus,
  sanitizeIntake,
  sanitizeRequestAnalysis,
} from "../supabase/functions/_shared/maintenance-domain.ts";

describe("maintenance AI structured-output parsing", () => {
  it("keeps one conservative maintenance issue and its supported work", () => {
    const result = sanitizeRequestAnalysis({
      summary: "The bathroom fan is loud.",
      facts: ["The fan makes a rattling noise."],
      unknowns: ["Whether airflow has decreased."],
      possible_causes: [{ text: "Motor or bearing wear", confidence: "medium" }],
      proposed_items: [{ title: "Inspect bathroom exhaust fan", note: "Check noise source and airflow.", kind: "task", material_type: "none" }],
    });

    expect(result.facts).toEqual(["The fan makes a rattling noise."]);
    expect(result.possible_causes).toEqual([{ text: "Motor or bearing wear", confidence: "medium" }]);
    expect(result.proposed_items).toEqual([{ title: "Inspect bathroom exhaust fan", note: "Check noise source and airflow.", kind: "task", material_type: "none", confidence: "low" }]);
  });

  it("splits a mixed walkthrough while preserving direct shopping and collect work", () => {
    const result = sanitizeIntake({
      requests: [
        { title: "Bathroom fan noise", summary: "Fan is rattling." },
        { title: "Kitchen faucet drip", summary: "A slow drip is reported underneath the faucet." },
      ],
      direct_items: [
        { title: "White paintable caulk", note: "For bathtub", kind: "material", material_type: "shopping" },
        { title: "Tall ladder", note: "Bring next visit", kind: "material", material_type: "collect" },
      ],
    });

    expect(result.requests).toHaveLength(2);
    expect(result.direct_items.map((item) => item.material_type)).toEqual(["shopping", "collect"]);
  });

  it("normalizes malformed material choices instead of leaking invalid item shapes", () => {
    const result = sanitizeRequestAnalysis({
      summary: 12,
      facts: ["Observed issue", null],
      unknowns: [],
      possible_causes: [{ text: "", confidence: "high" }],
      proposed_items: [
        { title: "Bring ladder", note: null, kind: "material", material_type: "invalid" },
        { title: "Inspect fan", note: "", kind: "task", material_type: "shopping" },
      ],
    });

    expect(result.summary).toBe("");
    expect(result.proposed_items).toEqual([
      { title: "Bring ladder", note: "", kind: "material", material_type: "collect", confidence: "low" },
      { title: "Inspect fan", note: "", kind: "task", material_type: "none", confidence: "low" },
    ]);
  });

  it("allows a conservative no-action analysis", () => {
    const result = sanitizeRequestAnalysis({
      summary: "The report does not yet support a specific action.",
      facts: ["A concern was reported without a clear condition."],
      unknowns: [],
      possible_causes: [],
      proposed_items: [],
    });

    expect(result.proposed_items).toEqual([]);
  });
});

describe("maintenance request status progression", () => {
  it("does not create active work from pending-review proposals", () => {
    expect(getMaintenanceStatus([{ status: "pending-review" }])).toBeNull();
  });

  it("moves from planned work to in-progress and resolves only when all approved work is done", () => {
    expect(getMaintenanceStatus([{ status: "approved" }])).toEqual({ status: "work-created", tenantStatus: "work-planned" });
    expect(getMaintenanceStatus([{ status: "done" }, { status: "approved" }])).toEqual({ status: "in-progress", tenantStatus: "in-progress" });
    expect(getMaintenanceStatus([{ status: "done" }, { status: "done" }])).toEqual({ status: "resolved", tenantStatus: "resolved" });
  });

  it("reopens a resolved request when later approved work appears", () => {
    expect(getMaintenanceStatus([{ status: "done" }, { status: "approved" }])).toEqual({ status: "in-progress", tenantStatus: "in-progress" });
  });
});
