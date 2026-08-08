export const MAINTENANCE_PROMPT_VERSION = "maintenance-intake-2026-08-07-history";
export const MAINTENANCE_SCHEMA_VERSION = "2026-08-07";

type UnknownRecord = Record<string, unknown>;

export type ProposedItem = {
  title: string;
  note: string;
  kind: "task" | "material";
  material_type: "shopping" | "collect" | "none";
};

export type RequestAnalysisDraft = {
  summary: string;
  facts: string[];
  unknowns: string[];
  possible_causes: Array<{ text: string; confidence: "low" | "medium" | "high" }>;
  relevant_history: Array<{ source_id: string; relevance: string }>;
  proposed_items: ProposedItem[];
};

export type RequestAnalysisOutput = Omit<RequestAnalysisDraft, "relevant_history"> & {
  relevant_history: Array<{
    source_id: string;
    source_type: "work_item" | "maintenance_request" | "maintenance_analysis";
    scope: "unit" | "property";
    summary: string;
    relevance: string;
    occurred_at: string | null;
  }>;
};

export type IntakeOutput = {
  requests: Array<{ title: string; summary: string }>;
  direct_items: ProposedItem[];
};

export const REQUEST_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "facts", "unknowns", "possible_causes", "relevant_history", "proposed_items"],
  properties: {
    summary: { type: "string", maxLength: 700 },
    facts: { type: "array", maxItems: 12, items: { type: "string", maxLength: 280 } },
    unknowns: { type: "array", maxItems: 8, items: { type: "string", maxLength: 280 } },
    possible_causes: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "confidence"],
        properties: {
          text: { type: "string", maxLength: 280 },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
    relevant_history: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source_id", "relevance"],
        properties: {
          source_id: { type: "string", minLength: 1, maxLength: 100 },
          relevance: { type: "string", minLength: 1, maxLength: 280 },
        },
      },
    },
    proposed_items: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "note", "kind", "material_type"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 140 },
          note: { type: "string", maxLength: 500 },
          kind: { type: "string", enum: ["task", "material"] },
          material_type: { type: "string", enum: ["shopping", "collect", "none"] },
        },
      },
    },
  },
} as const;

export const INTAKE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["requests", "direct_items"],
  properties: {
    requests: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 140 },
          summary: { type: "string", minLength: 1, maxLength: 700 },
        },
      },
    },
    direct_items: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "note", "kind", "material_type"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 140 },
          note: { type: "string", maxLength: 500 },
          kind: { type: "string", enum: ["task", "material"] },
          material_type: { type: "string", enum: ["shopping", "collect", "none"] },
        },
      },
    },
  },
} as const;

export const MAINTENANCE_ANALYSIS_INSTRUCTIONS = [
  "You analyze maintenance reports for a rental-property operations team.",
  "Be conservative. Separate reported facts from inferences. Never invent unseen conditions or repair needs.",
  "Only include a possible cause when it has reasonable support. Keep its confidence explicit.",
  "When diagnosis is uncertain, propose an inspection task instead of a repair or replacement.",
  "Unknowns belong only when resolving them would materially improve the work decision.",
  "Propose tasks or materials only when reasonably supported. Do not recommend replacement parts merely because they might theoretically be needed.",
  "Relevant work history is past context, not proof of the current condition. Do not present historical information as a current fact. Only cite supplied history source IDs that materially inform this analysis.",
  "This is an internal operational analysis. Return only the requested fields; do not add conversational prompts or extra reasoning.",
].join(" ");

export const MAINTENANCE_INTAKE_INSTRUCTIONS = [
  "You classify an administrator's natural-language property walkthrough into maintenance cases and direct operational work.",
  "Create a maintenance case only for a distinct reported problem or condition that merits its own case history.",
  "Use direct items for clearly simple tasks, shopping items, or collect/bring reminders. Do not create artificial cases for those notes.",
  "Split only clearly separate issues. Keep related statements in one case, and ignore irrelevant commentary.",
  "Do not diagnose unseen conditions or invent repair needs. Titles and summaries must stay grounded in the supplied content.",
].join(" ");

export function sanitizeProposedItems(value: unknown): ProposedItem[] {
  const items = Array.isArray(value) ? value : [];
  return items
    .map((item) => {
      const record = asRecord(item);
      const title = text(record.title, 140);
      const note = text(record.note, 500);
      const kind = record.kind === "material" ? "material" : "task";
      const materialType = record.material_type === "collect" ? "collect"
        : record.material_type === "shopping" ? "shopping" : "none";
      if (!title) return null;
      if (kind === "material") {
        return {
          title,
          note,
          kind,
          material_type: materialType === "none" ? "shopping" : materialType,
        };
      }
      return { title, note, kind, material_type: "none" };
    })
    .filter((item): item is ProposedItem => Boolean(item));
}

export function sanitizeRequestAnalysis(value: unknown): RequestAnalysisDraft {
  const record = asRecord(value);
  return {
    summary: text(record.summary, 700),
    facts: stringList(record.facts, 12, 280),
    unknowns: stringList(record.unknowns, 8, 280),
    possible_causes: (Array.isArray(record.possible_causes) ? record.possible_causes : [])
      .map((cause) => {
        const item = asRecord(cause);
        const causeText = text(item.text, 280);
        if (!causeText) return null;
        const confidence = item.confidence === "high" || item.confidence === "medium" ? item.confidence : "low";
        return { text: causeText, confidence };
      })
      .filter((cause): cause is { text: string; confidence: "low" | "medium" | "high" } => Boolean(cause))
      .slice(0, 6),
    relevant_history: (Array.isArray(record.relevant_history) ? record.relevant_history : [])
      .map((history) => {
        const item = asRecord(history);
        const source_id = text(item.source_id, 100);
        const relevance = text(item.relevance, 280);
        return source_id && relevance ? { source_id, relevance } : null;
      })
      .filter((history): history is { source_id: string; relevance: string } => Boolean(history))
      .slice(0, 8),
    proposed_items: sanitizeProposedItems(record.proposed_items).slice(0, 12),
  };
}

export function sanitizeIntake(value: unknown): IntakeOutput {
  const record = asRecord(value);
  return {
    requests: (Array.isArray(record.requests) ? record.requests : [])
      .map((request) => {
        const item = asRecord(request);
        const title = text(item.title, 140);
        const summary = text(item.summary, 700);
        return title && summary ? { title, summary } : null;
      })
      .filter((request): request is { title: string; summary: string } => Boolean(request))
      .slice(0, 8),
    direct_items: sanitizeProposedItems(record.direct_items).slice(0, 12),
  };
}

export function getMaintenanceStatus(items: Array<{ status: string }>) {
  const approved = items.filter((item) => item.status === "approved" || item.status === "done");
  if (approved.length === 0) return null;
  if (approved.every((item) => item.status === "done")) {
    return { status: "resolved", tenantStatus: "resolved" };
  }
  if (approved.some((item) => item.status === "done")) {
    return { status: "in-progress", tenantStatus: "in-progress" };
  }
  return { status: "work-created", tenantStatus: "work-planned" };
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function stringList(value: unknown, maxItems: number, maxLength: number) {
  return (Array.isArray(value) ? value : [])
    .map((item) => text(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}
