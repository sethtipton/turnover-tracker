export type HistorySourceType = "work_item" | "maintenance_request" | "maintenance_analysis";

export type HistoryCandidate = {
  source_id: string;
  source_type: HistorySourceType;
  scope: "unit" | "property";
  title: string;
  detail: string;
  occurred_at: string | null;
};

export type RelevantHistoryRecord = {
  source_id: string;
  source_type: HistorySourceType;
  scope: "unit" | "property";
  summary: string;
  relevance: string;
  occurred_at: string | null;
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "be", "by", "for", "from", "has", "have", "in", "is", "it", "of", "on", "or", "that", "the", "to", "was", "with", "will", "would", "unit", "property", "request", "reported",
]);

const SHARED_SYSTEM_TERMS = new Set([
  "air", "bathroom", "drain", "drainage", "electrical", "fan", "faucet", "foundation", "heat", "heating", "hvac", "leak", "main", "plumbing", "roof", "sewer", "utility", "vent", "water",
]);

function tokens(value: string) {
  return new Set((value.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((token) => !STOP_WORDS.has(token)));
}

function overlap(left: Set<string>, right: Set<string>) {
  return [...left].filter((token) => right.has(token));
}

function summary(candidate: HistoryCandidate) {
  const detail = candidate.detail.trim();
  return `${candidate.title}${detail ? ` — ${detail}` : ""}`.slice(0, 700);
}

/**
 * Bounded, deterministic retrieval for maintenance context. Candidates are
 * intentionally supplied only from the current unit and property-wide work;
 * this prevents unrelated unit history from becoming model context.
 */
export function selectRelevantHistory(
  requestText: string,
  candidates: HistoryCandidate[],
  maxItems = 8,
): RelevantHistoryRecord[] {
  const requestTokens = tokens(requestText);
  const requestSystems = overlap(requestTokens, SHARED_SYSTEM_TERMS);

  return candidates
    .map((candidate) => {
      const candidateTokens = tokens(`${candidate.title} ${candidate.detail}`);
      const matches = overlap(requestTokens, candidateTokens);
      const sharedSystemMatch = overlap(requestSystems, candidateTokens);
      // Property-wide work must have a direct keyword or shared-system match.
      // Unit history gets a small scope boost, but unrelated entries remain out.
      if (matches.length === 0 && sharedSystemMatch.length === 0) return null;
      const score = (candidate.scope === "unit" ? 100 : 40) + matches.length * 12 + sharedSystemMatch.length * 18;
      const matchedTerms = [...new Set([...matches, ...sharedSystemMatch])].slice(0, 3);
      return {
        candidate,
        score,
        relevance: candidate.scope === "unit"
          ? `Prior work in this unit related by ${matchedTerms.join(", ")}.`
          : `Property-wide work related by ${matchedTerms.join(", ")}.`,
      };
    })
    .filter((item): item is { candidate: HistoryCandidate; score: number; relevance: string } => Boolean(item))
    .sort((left, right) => right.score - left.score || (right.candidate.occurred_at || "").localeCompare(left.candidate.occurred_at || ""))
    .slice(0, maxItems)
    .map(({ candidate, relevance }) => ({
      source_id: candidate.source_id,
      source_type: candidate.source_type,
      scope: candidate.scope,
      summary: summary(candidate),
      relevance,
      occurred_at: candidate.occurred_at,
    }));
}
