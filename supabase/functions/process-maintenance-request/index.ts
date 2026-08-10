import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import {
  INTAKE_SCHEMA,
  MAINTENANCE_ANALYSIS_INSTRUCTIONS,
  MAINTENANCE_INTAKE_INSTRUCTIONS,
  MAINTENANCE_PROMPT_VERSION,
  MAINTENANCE_SCHEMA_VERSION,
  REQUEST_ANALYSIS_SCHEMA,
  sanitizeIntake,
  sanitizeRequestAnalysis,
  type IntakeOutput,
  type ProposedItem,
  type RequestAnalysisDraft,
  type RequestAnalysisOutput,
} from "../_shared/maintenance-domain.ts";
import { selectRelevantHistory, type HistoryCandidate, type RelevantHistoryRecord } from "../_shared/maintenance-history.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestRow = {
  id: string;
  workspace_id: string;
  property_id: string;
  unit_id: string | null;
  parent_request_id: string | null;
  source_type: string;
  source_revision: number;
  title: string;
  original_description: string;
  processing_status: string;
  tenant_status: string;
};

type EntryRow = {
  id: string;
  author_type: string;
  entry_type: string;
  visibility: string;
  content: string;
  transcript: string | null;
  created_at: string;
};

type AttachmentRow = {
  id: string;
  entry_id: string | null;
  kind: string;
  file_name: string;
  mime_type: string;
  storage_path: string;
  visibility: string;
};

type AnalysisRow = {
  id: string;
  maintenance_request_id: string;
  sequence_number: number;
  analysis_kind: "request" | "intake";
  source_revision: number;
  source_hash: string;
  processing_status: "processing" | "completed" | "failed";
  structured_output: unknown;
};

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

    try {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "Authentication required." }, 401);

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
      const openAiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
      const transcriptionModel = Deno.env.get("OPENAI_TRANSCRIPTION_MODEL") || "gpt-4o-transcribe";
      if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
        return jsonResponse({ error: "Supabase function environment is not configured." }, 503);
      }
      if (!openAiApiKey) return jsonResponse({ error: "OpenAI credentials are not configured." }, 503);

      const requester = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const service = createClient(supabaseUrl, serviceRoleKey);
      const {
        data: { user },
        error: userError,
      } = await requester.auth.getUser();
      if (userError || !user) return jsonResponse({ error: "Authentication required." }, 401);

      const { maintenanceRequestId, forceRetry = false } = await request.json();
      if (!maintenanceRequestId) return jsonResponse({ error: "maintenanceRequestId is required." }, 400);

      // This query is the authorization gate. The service-role client is used only
      // after caller RLS has confirmed access to this exact request.
      const { data: authorizedRequest, error: accessError } = await requester
        .from("maintenance_requests")
        .select("id")
        .eq("id", maintenanceRequestId)
        .single();
      if (accessError || !authorizedRequest) return jsonResponse({ error: "You do not have access to this request." }, 403);

      const result = await processMaintenanceRequest({
        service,
        maintenanceRequestId,
        forceRetry: Boolean(forceRetry),
        openAiApiKey,
        openAiModel,
        transcriptionModel,
      });
      return jsonResponse(result);
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "Maintenance processing failed." }, 500);
    }
  },
};

async function processMaintenanceRequest({
  service,
  maintenanceRequestId,
  forceRetry,
  openAiApiKey,
  openAiModel,
  transcriptionModel,
}: {
  service: SupabaseClient;
  maintenanceRequestId: string;
  forceRetry: boolean;
  openAiApiKey: string;
  openAiModel: string;
  transcriptionModel: string;
}) {
  let request = await getRequest(service, maintenanceRequestId);
  if (forceRetry) request = await beginForcedReanalysis(service, request);
  await transcribePendingAudio({ service, request, openAiApiKey, transcriptionModel });
  const refreshed = await getRequest(service, maintenanceRequestId);

  if (refreshed.source_type === "admin-walkthrough" && !refreshed.parent_request_id) {
    return processWalkthrough({ service, request: refreshed, forceRetry, openAiApiKey, openAiModel });
  }
  return processSingleRequest({ service, request: refreshed, forceRetry, openAiApiKey, openAiModel });
}

async function beginForcedReanalysis(service: SupabaseClient, request: RequestRow) {
  const { error } = await service
    .from("maintenance_requests")
    .update({ source_revision: request.source_revision + 1, processing_status: "pending", processing_error: null })
    .eq("id", request.id)
    .eq("source_revision", request.source_revision);
  if (error) throw error;
  await service.from("maintenance_request_events").insert({
    maintenance_request_id: request.id,
    action: "analysis-reanalysis-requested",
    label: `New AI analysis requested for ${request.title}`,
    details: { source_revision: request.source_revision + 1 },
  });
  return getRequest(service, request.id);
}

async function processSingleRequest({
  service,
  request,
  forceRetry,
  openAiApiKey,
  openAiModel,
}: {
  service: SupabaseClient;
  request: RequestRow;
  forceRetry: boolean;
  openAiApiKey: string;
  openAiModel: string;
}) {
  const snapshot = await getInputSnapshot(service, request, true);
  const sourceHash = await hashSnapshot(snapshot);
  const claim = await claimAnalysis(service, request, "request", sourceHash, forceRetry);
  if (claim.analysis.processing_status === "completed") {
    return { status: "already-completed", requestId: request.id, analysisId: claim.analysis.id };
  }
  if (!claim.claimed) return { status: "already-processing", requestId: request.id, analysisId: claim.analysis.id };

  try {
    const draft = await requestStructuredOutput<RequestAnalysisDraft>({
      apiKey: openAiApiKey,
      model: openAiModel,
      name: "maintenance_request_analysis",
      schema: REQUEST_ANALYSIS_SCHEMA,
      system: MAINTENANCE_ANALYSIS_INSTRUCTIONS,
      user: formatRequestInput(request, snapshot),
      sanitize: sanitizeRequestAnalysis,
    });
    const guardedDraft = applyKnownAmbiguityGuardrails(draft, request, snapshot);
    const proposedItems = limitReviewMaterialSuggestions(guardedDraft.proposed_items);
    const output: RequestAnalysisOutput = {
      ...guardedDraft,
      proposed_items: proposedItems,
      relevant_history: materializeRelevantHistory(guardedDraft, snapshot.relevant_history),
    };
    await createGeneratedItems(service, request, claim.analysis.id, output.proposed_items, "proposal", getSubmittedRequestText(request, snapshot));
    await completeAnalysis(service, request, claim.analysis.id, output, snapshot, openAiModel);
    return { status: "completed", requestId: request.id, analysisId: claim.analysis.id, proposedItemCount: output.proposed_items.length };
  } catch (error) {
    await failAnalysis(service, request, claim.analysis.id, error);
    throw error;
  }
}

async function processWalkthrough({
  service,
  request,
  forceRetry,
  openAiApiKey,
  openAiModel,
}: {
  service: SupabaseClient;
  request: RequestRow;
  forceRetry: boolean;
  openAiApiKey: string;
  openAiModel: string;
}) {
  const snapshot = await getInputSnapshot(service, request, false);
  const sourceHash = await hashSnapshot(snapshot);
  const claim = await claimAnalysis(service, request, "intake", sourceHash, forceRetry);
  let output: IntakeOutput;

  if (claim.analysis.processing_status === "completed") {
    output = sanitizeIntake(claim.analysis.structured_output);
  } else if (!claim.claimed) {
    return { status: "already-processing", requestId: request.id, analysisId: claim.analysis.id };
  } else {
    try {
      output = await requestStructuredOutput<IntakeOutput>({
        apiKey: openAiApiKey,
        model: openAiModel,
        name: "maintenance_walkthrough_intake",
        schema: INTAKE_SCHEMA,
        system: MAINTENANCE_INTAKE_INSTRUCTIONS,
        user: formatWalkthroughInput(request, snapshot),
        sanitize: sanitizeIntake,
      });
      await completeAnalysis(service, request, claim.analysis.id, output, snapshot, openAiModel);
    } catch (error) {
      await failAnalysis(service, request, claim.analysis.id, error);
      throw error;
    }
  }

  await createGeneratedItems(service, request, claim.analysis.id, output.direct_items, "direct");
  const childIds = await materializeWalkthroughRequests(service, request, claim.analysis.id, output.requests);
  const childResults = [];
  for (const childId of childIds) {
    const child = await getRequest(service, childId);
    childResults.push(await processSingleRequest({ service, request: child, forceRetry, openAiApiKey, openAiModel }));
  }
  return {
    status: "completed",
    requestId: request.id,
    analysisId: claim.analysis.id,
    createdRequestCount: childIds.length,
    directItemCount: output.direct_items.length,
    requests: childResults,
  };
}

async function materializeWalkthroughRequests(
  service: SupabaseClient,
  parent: RequestRow,
  analysisId: string,
  requests: IntakeOutput["requests"],
) {
  const createdIds: string[] = [];
  for (const [index, split] of requests.entries()) {
    const sourceKey = `${analysisId}:request:${index}`;
    let { data: child } = await service
      .from("maintenance_requests")
      .select("id")
      .eq("parent_request_id", parent.id)
      .eq("source_key", sourceKey)
      .maybeSingle();
    if (!child) {
      const { data, error } = await service
        .from("maintenance_requests")
        .insert({
          workspace_id: parent.workspace_id,
          property_id: parent.property_id,
          unit_id: parent.unit_id,
          parent_request_id: parent.id,
          source_type: "admin-walkthrough-split",
          source_key: sourceKey,
          submitter_email: "system",
          title: split.title,
          original_description: split.summary,
          status: "submitted",
          tenant_status: "received",
        })
        .select("id")
        .single();
      if (error) throw error;
      child = data;
      const { error: entryError } = await service
        .from("maintenance_request_entries")
        .insert({
          maintenance_request_id: child.id,
          author_type: "system",
          author_email: "system",
          entry_type: "description",
          visibility: "admin",
          content: split.summary,
        });
      if (entryError) throw entryError;
    }
    createdIds.push(child.id);
  }
  return createdIds;
}

async function getRequest(service: SupabaseClient, requestId: string): Promise<RequestRow> {
  const { data, error } = await service
    .from("maintenance_requests")
    .select("id,workspace_id,property_id,unit_id,parent_request_id,source_type,source_revision,title,original_description,processing_status,tenant_status")
    .eq("id", requestId)
    .single();
  if (error || !data) throw error || new Error("Maintenance request was not found.");
  return data;
}

async function getInputSnapshot(service: SupabaseClient, request: RequestRow, includeHistory: boolean) {
  const [{ data: entries, error: entryError }, { data: attachments, error: attachmentError }] = await Promise.all([
    service
      .from("maintenance_request_entries")
      .select("id,author_type,entry_type,visibility,content,transcript,created_at")
      .eq("maintenance_request_id", request.id)
      .order("created_at", { ascending: true }),
    service
      .from("maintenance_attachments")
      .select("id,entry_id,kind,file_name,mime_type,storage_path,visibility")
      .eq("maintenance_request_id", request.id)
      .order("created_at", { ascending: true }),
  ]);
  if (entryError) throw entryError;
  if (attachmentError) throw attachmentError;
  const relevant_history = includeHistory ? await getRelevantHistory(service, request) : [];
  return {
    entries: (entries || []) as EntryRow[],
    attachments: (attachments || []) as AttachmentRow[],
    relevant_history,
  };
}

async function getRelevantHistory(service: SupabaseClient, request: RequestRow): Promise<RelevantHistoryRecord[]> {
  let workQuery = service
    .from("items")
    .select("id,unit_id,title,note,kind,material_type,status,created_at,completed_at,archived_at")
    .eq("property_id", request.property_id)
    .or("status.eq.done,archived_at.not.is.null")
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(80);
  workQuery = request.unit_id
    ? workQuery.or(`unit_id.eq.${request.unit_id},unit_id.is.null`)
    : workQuery.is("unit_id", null);

  let requestQuery = service
    .from("maintenance_requests")
    .select("id,unit_id,title,original_description,status,created_at,updated_at,resolved_at")
    .eq("property_id", request.property_id)
    .neq("id", request.id)
    .is("parent_request_id", null)
    .order("updated_at", { ascending: false })
    .limit(40);
  requestQuery = request.unit_id
    ? requestQuery.or(`unit_id.eq.${request.unit_id},unit_id.is.null`)
    : requestQuery.is("unit_id", null);

  const [{ data: workItems, error: workError }, { data: priorRequests, error: requestError }] = await Promise.all([
    workQuery,
    requestQuery,
  ]);
  if (workError) throw workError;
  if (requestError) throw requestError;

  const candidates: HistoryCandidate[] = [
    ...(workItems || []).map((item) => ({
      source_id: item.id,
      source_type: "work_item" as const,
      scope: item.unit_id ? "unit" as const : "property" as const,
      title: item.title,
      detail: [item.note, item.kind === "material" ? `Material: ${item.material_type || "supplies"}` : "Completed work"].filter(Boolean).join(". "),
      occurred_at: item.completed_at || item.archived_at || item.created_at,
    })),
    ...(priorRequests || []).map((prior) => ({
      source_id: prior.id,
      source_type: "maintenance_request" as const,
      scope: prior.unit_id ? "unit" as const : "property" as const,
      title: prior.title,
      detail: prior.original_description,
      occurred_at: prior.resolved_at || prior.updated_at || prior.created_at,
    })),
  ];

  const priorIds = (priorRequests || []).map((prior) => prior.id);
  if (priorIds.length > 0) {
    const { data: analyses, error: analysisError } = await service
      .from("maintenance_analyses")
      .select("id,maintenance_request_id,structured_output,completed_at,created_at")
      .in("maintenance_request_id", priorIds)
      .eq("processing_status", "completed")
      .order("completed_at", { ascending: false })
      .limit(40);
    if (analysisError) throw analysisError;
    const priorById = new Map((priorRequests || []).map((prior) => [prior.id, prior]));
    for (const analysis of analyses || []) {
      const sourceRequest = priorById.get(analysis.maintenance_request_id);
      const output = analysis.structured_output && typeof analysis.structured_output === "object"
        ? analysis.structured_output as Record<string, unknown>
        : {};
      const analysisSummary = typeof output.summary === "string" ? output.summary : "";
      if (!sourceRequest || !analysisSummary) continue;
      candidates.push({
        source_id: analysis.id,
        source_type: "maintenance_analysis",
        scope: sourceRequest.unit_id ? "unit" : "property",
        title: `Prior analysis: ${sourceRequest.title}`,
        detail: analysisSummary,
        occurred_at: analysis.completed_at || analysis.created_at,
      });
    }
  }
  return selectRelevantHistory(`${request.title}\n${request.original_description}`, candidates);
}

function materializeRelevantHistory(draft: RequestAnalysisDraft, candidates: RelevantHistoryRecord[]): RequestAnalysisOutput["relevant_history"] {
  const byId = new Map(candidates.map((candidate) => [candidate.source_id, candidate]));
  const selected = draft.relevant_history
    .map((reference) => {
      const candidate = byId.get(reference.source_id);
      return candidate ? { ...candidate, relevance: reference.relevance } : null;
    })
    .filter((history): history is RelevantHistoryRecord => Boolean(history));
  return selected.length > 0 ? selected : candidates.slice(0, 3);
}

async function transcribePendingAudio({
  service,
  request,
  openAiApiKey,
  transcriptionModel,
}: {
  service: SupabaseClient;
  request: RequestRow;
  openAiApiKey: string;
  transcriptionModel: string;
}) {
  const snapshot = await getInputSnapshot(service, request, false);
  const byEntry = new Map(snapshot.attachments.filter((attachment) => attachment.kind === "audio" && attachment.entry_id)
    .map((attachment) => [attachment.entry_id, attachment]));

  for (const entry of snapshot.entries) {
    if (entry.entry_type !== "audio" || entry.transcript?.trim()) continue;
    const attachment = byEntry.get(entry.id);
    if (!attachment) continue;
    const { data: audioBlob, error } = await service.storage.from("maintenance-attachments").download(attachment.storage_path);
    if (error) throw error;
    const transcript = await transcribeAudio({
      apiKey: openAiApiKey,
      model: transcriptionModel,
      fileName: attachment.file_name,
      audioBlob,
    });
    const { error: updateError } = await service
      .from("maintenance_request_entries")
      .update({ transcript })
      .eq("id", entry.id);
    if (updateError) throw updateError;
  }
}

async function claimAnalysis(
  service: SupabaseClient,
  request: RequestRow,
  analysisKind: "request" | "intake",
  sourceHash: string,
  forceRetry: boolean,
): Promise<{ analysis: AnalysisRow; claimed: boolean }> {
  const { data: existing, error: existingError } = await service
    .from("maintenance_analyses")
    .select("id,maintenance_request_id,sequence_number,analysis_kind,source_revision,source_hash,processing_status,structured_output")
    .eq("maintenance_request_id", request.id)
    .eq("analysis_kind", analysisKind)
    .eq("source_revision", request.source_revision)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.processing_status === "completed") return { analysis: existing as AnalysisRow, claimed: false };
  if (existing?.processing_status === "processing" && !forceRetry) return { analysis: existing as AnalysisRow, claimed: false };
  if (existing) {
    const { data, error } = await service
      .from("maintenance_analyses")
      .update({ processing_status: "processing", error_message: null, source_hash: sourceHash })
      .eq("id", existing.id)
      .select("id,maintenance_request_id,sequence_number,analysis_kind,source_revision,source_hash,processing_status,structured_output")
      .single();
    if (error) throw error;
    await setRequestProcessing(service, request.id, "processing");
    return { analysis: data as AnalysisRow, claimed: true };
  }

  const { data: latest } = await service
    .from("maintenance_analyses")
    .select("sequence_number")
    .eq("maintenance_request_id", request.id)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sequenceNumber = (latest?.sequence_number || 0) + 1;
  const { data, error } = await service
    .from("maintenance_analyses")
    .insert({
      maintenance_request_id: request.id,
      sequence_number: sequenceNumber,
      analysis_kind: analysisKind,
      source_revision: request.source_revision,
      source_hash: sourceHash,
      processing_status: "processing",
      prompt_version: MAINTENANCE_PROMPT_VERSION,
      schema_version: MAINTENANCE_SCHEMA_VERSION,
    })
    .select("id,maintenance_request_id,sequence_number,analysis_kind,source_revision,source_hash,processing_status,structured_output")
    .single();
  if (error) {
    const { data: conflict } = await service
      .from("maintenance_analyses")
      .select("id,maintenance_request_id,sequence_number,analysis_kind,source_revision,source_hash,processing_status,structured_output")
      .eq("maintenance_request_id", request.id)
      .eq("analysis_kind", analysisKind)
      .eq("source_revision", request.source_revision)
      .single();
    if (conflict) return { analysis: conflict as AnalysisRow, claimed: false };
    throw error;
  }
  await setRequestProcessing(service, request.id, "processing");
  return { analysis: data as AnalysisRow, claimed: true };
}

async function createGeneratedItems(
  service: SupabaseClient,
  request: RequestRow,
  analysisId: string,
  items: ProposedItem[],
  prefix: "proposal" | "direct",
  submittedRequestText = "",
) {
  const { data: existing, error: existingError } = await service
    .from("items")
    .select("generation_key")
    .eq("maintenance_analysis_id", analysisId);
  if (existingError) throw existingError;
  const existingKeys = new Set((existing || []).map((item) => item.generation_key));
  const missing = items.filter((_, index) => !existingKeys.has(`${prefix}:${index}`));
  if (missing.length === 0) return;

  let scopeQuery = service
    .from("items")
    .select("sort_order")
    .eq("property_id", request.property_id);
  scopeQuery = request.unit_id
    ? scopeQuery.eq("unit_id", request.unit_id)
    : scopeQuery.is("unit_id", null);
  const { data: lastItems, error: lastItemsError } = await scopeQuery
    .order("sort_order", { ascending: false })
    .limit(1);
  if (lastItemsError) throw lastItemsError;
  const lastSortOrder = lastItems?.[0]?.sort_order || 0;

  const rows = missing.map((item) => {
    const originalIndex = items.indexOf(item);
    return {
      workspace_id: request.workspace_id,
      property_id: request.property_id,
      unit_id: request.unit_id,
      maintenance_request_id: prefix === "proposal" ? request.id : null,
      maintenance_analysis_id: analysisId,
      generation_key: `${prefix}:${originalIndex}`,
      title: item.title,
      note: prefix === "proposal" ? appendSubmittedRequest(item.note, submittedRequestText) : item.note,
      category: item.kind === "material"
        ? item.material_type === "collect" ? "Collect / Bring" : "Shopping List"
        : "Task",
      kind: item.kind,
      material_type: item.kind === "material" ? item.material_type : null,
      status: "pending-review",
      sort_order: lastSortOrder + originalIndex + 1,
    };
  });
  const { error } = await service.from("items").insert(rows);
  if (error) throw error;
}

function getSubmittedRequestText(request: RequestRow, snapshot: Awaited<ReturnType<typeof getInputSnapshot>>) {
  if (request.original_description.trim()) return request.original_description.trim();
  return snapshot.entries
    .filter((entry) => entry.entry_type === "description" || entry.entry_type === "audio")
    .map((entry) => entry.transcript || entry.content)
    .filter((text) => text.trim())
    .join("\n")
    .trim();
}

function appendSubmittedRequest(note: string, submittedRequestText: string) {
  const source = submittedRequestText.trim();
  if (!source) return note;
  const label = `Original request: ${source}`;
  return note.includes(label) ? note : [note.trim(), label].filter(Boolean).join("\n\n");
}

function limitReviewMaterialSuggestions(items: ProposedItem[]) {
  const materialCounts = { shopping: 0, collect: 0 };
  return items.filter((item) => {
    if (item.kind !== "material") return true;
    if (item.material_type === "shopping" && item.confidence !== "high") return false;
    if (item.material_type === "collect" && item.confidence === "low") return false;

    const type = item.material_type === "collect" ? "collect" : "shopping";
    if (materialCounts[type] >= 3) return false;
    materialCounts[type] += 1;
    return true;
  });
}

function applyKnownAmbiguityGuardrails(
  draft: RequestAnalysisDraft,
  request: RequestRow,
  snapshot: Awaited<ReturnType<typeof getInputSnapshot>>,
): RequestAnalysisDraft {
  const submittedText = getSubmittedRequestText(request, snapshot);
  const normalizedText = submittedText.toLocaleLowerCase();
  const mentionsPlumbingFixture = /\b(sink|faucet|tap|drain|pipe|plumbing)\b/.test(normalizedText);
  const describesDropping = /\bdropp?ing\b/.test(normalizedText);
  if (!mentionsPlumbingFixture || !describesDropping) return draft;

  const question = "When you say the sink is ‘dropping,’ do you mean dripping or leaking, or that the sink itself is sagging or coming loose?";
  return {
    ...draft,
    facts: draft.facts.length > 0 ? draft.facts : [submittedText],
    unknowns: uniqueText([
      "Whether the report refers to a water drip or leak, or to the sink physically sagging or coming loose.",
      ...draft.unknowns,
    ], 8),
    clarifying_questions: uniqueText([question, ...draft.clarifying_questions], 6),
    possible_causes: [],
    proposed_items: [{
      title: "Clarify kitchen sink issue",
      note: "Confirm whether the report means a drip or leak, or that the sink itself is sagging or coming loose, before assigning repair work or materials.",
      kind: "task",
      material_type: "none",
      confidence: "high",
    }, {
      title: "Bring kitchen sink inspection tools",
      note: "Bring a flashlight, gloves, and basic plumbing hand tools to inspect whether the report concerns a drip or leak, or a sink that is sagging or coming loose.",
      kind: "material",
      material_type: "collect",
      confidence: "medium",
    }],
  };
}

function uniqueText(values: string[], maxItems: number) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, maxItems);
}

async function completeAnalysis(
  service: SupabaseClient,
  request: RequestRow,
  analysisId: string,
  output: unknown,
  snapshot: unknown,
  model: string,
) {
  const { error } = await service
    .from("maintenance_analyses")
    .update({
      processing_status: "completed",
      structured_output: output,
      input_snapshot: snapshot,
      model,
      completed_at: new Date().toISOString(),
    })
    .eq("id", analysisId);
  if (error) throw error;
  await service.from("maintenance_requests").update({
    processing_status: "completed",
    processing_error: null,
    status: "under-review",
  }).eq("id", request.id).in("status", ["submitted", "under-review"]);
  await service.from("maintenance_request_events").insert({
    maintenance_request_id: request.id,
    action: "analysis-completed",
    label: `AI analysis completed for ${request.title}`,
    details: { analysis_id: analysisId, prompt_version: MAINTENANCE_PROMPT_VERSION },
  });
}

async function failAnalysis(service: SupabaseClient, request: RequestRow, analysisId: string, sourceError: unknown) {
  const errorMessage = sourceError instanceof Error ? sourceError.message : "Maintenance processing failed.";
  await service.from("maintenance_analyses").update({
    processing_status: "failed",
    error_message: errorMessage.slice(0, 1000),
  }).eq("id", analysisId);
  await service.from("maintenance_requests").update({
    processing_status: "failed",
    // Tenants may read their request row. Keep provider and implementation
    // diagnostics in the admin-only analysis/event records instead.
    processing_error: "Analysis could not be completed. An administrator can retry it.",
  }).eq("id", request.id);
  await service.from("maintenance_request_events").insert({
    maintenance_request_id: request.id,
    action: "analysis-failed",
    label: `AI analysis failed for ${request.title}`,
    details: { analysis_id: analysisId, error: errorMessage.slice(0, 1000) },
  });
}

async function setRequestProcessing(service: SupabaseClient, requestId: string, status: "processing") {
  const { error } = await service.from("maintenance_requests").update({
    processing_status: status,
    processing_error: null,
  }).eq("id", requestId);
  if (error) throw error;
}

async function requestStructuredOutput<T>({
  apiKey,
  model,
  name,
  schema,
  system,
  user,
  sanitize,
}: {
  apiKey: string;
  model: string;
  name: string;
  schema: unknown;
  system: string;
  user: string;
  sanitize: (value: unknown) => T;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [{ role: "system", content: system }, { role: "user", content: user }],
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || "OpenAI maintenance analysis failed.");
  const outputText = getOutputText(body);
  return sanitize(JSON.parse(outputText));
}

async function transcribeAudio({ apiKey, model, fileName, audioBlob }: {
  apiKey: string;
  model: string;
  fileName: string;
  audioBlob: Blob;
}) {
  const body = new FormData();
  body.append("model", model);
  body.append("file", audioBlob, fileName || "maintenance-message.webm");
  body.append("response_format", "json");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI transcription failed.");
  const transcript = data?.text?.trim();
  if (!transcript) throw new Error("OpenAI returned an empty transcript.");
  return transcript;
}

function formatRequestInput(request: RequestRow, snapshot: Awaited<ReturnType<typeof getInputSnapshot>>) {
  const entries = snapshot.entries.map((entry) => ({
    source: entry.author_type,
    type: entry.entry_type,
    text: entry.transcript || entry.content,
  }));
  const photos = snapshot.attachments
    .filter((attachment) => attachment.kind === "photo")
    .map((attachment) => ({ file_name: attachment.file_name, mime_type: attachment.mime_type }));
  return JSON.stringify({
    current_request: { title: request.title, original_description: request.original_description },
    new_information: entries,
    relevant_work_history: snapshot.relevant_history,
    history_instruction: "History describes past work only. It is context, not evidence that a past condition still exists. Cite only supplied source_id values when it materially improves the analysis.",
    photo_metadata: photos,
    photo_note: "Photos are retained for human review. Do not infer visual content from metadata.",
  });
}

function formatWalkthroughInput(request: RequestRow, snapshot: Awaited<ReturnType<typeof getInputSnapshot>>) {
  return JSON.stringify({
    property_scope: { property_id: request.property_id, unit_id: request.unit_id },
    entries: snapshot.entries.map((entry) => ({ type: entry.entry_type, text: entry.transcript || entry.content })),
  });
}

function getOutputText(responseBody: Record<string, unknown>) {
  if (typeof responseBody.output_text === "string") return responseBody.output_text;
  const output = Array.isArray(responseBody.output) ? responseBody.output : [];
  const text = output
    .flatMap((item) => item && typeof item === "object" && "content" in item && Array.isArray(item.content) ? item.content : [])
    .map((content) => content && typeof content === "object" && "text" in content && typeof content.text === "string" ? content.text : "")
    .join("")
    .trim();
  if (!text) throw new Error("OpenAI returned no maintenance analysis content.");
  return text;
}

async function hashSnapshot(snapshot: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
