import { supabase } from "./supabase";
import { getAttachmentKind } from "./media";

const MAINTENANCE_BUCKET = "maintenance-attachments";

export const REQUEST_STATUS_LABELS = {
  received: "Received",
  submitted: "Received",
  "under-review": "Under review",
  "work-planned": "Work planned",
  "work-created": "Work planned",
  "in-progress": "Work in progress",
  resolved: "Resolved",
};

export async function loadTenantUnits() {
  const { data, error } = await supabase.rpc("get_my_tenant_units");
  if (error) throw error;
  return data || [];
}

export async function loadMaintenanceRequests({ workspaceId, tenant = false }) {
  let query = supabase
    .from("maintenance_requests")
    .select("id,workspace_id,property_id,unit_id,tenant_membership_id,parent_request_id,source_type,title,original_description,status,tenant_status,processing_status,processing_error,created_at,updated_at,resolved_at")
    .order("updated_at", { ascending: false });
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((request) => tenant ? toTenantRequest(request) : request);
}

export async function loadAdminMaintenanceDetail(requestId) {
  const [requestResult, entriesResult, attachmentsResult, analysesResult, requestItemsResult, eventsResult] = await Promise.all([
    supabase.from("maintenance_requests").select("*").eq("id", requestId).single(),
    supabase.from("maintenance_request_entries").select("*").eq("maintenance_request_id", requestId).order("created_at", { ascending: true }),
    supabase.from("maintenance_attachments").select("*").eq("maintenance_request_id", requestId).order("created_at", { ascending: true }),
    supabase.from("maintenance_analyses").select("*").eq("maintenance_request_id", requestId).order("sequence_number", { ascending: false }),
    supabase.from("items").select("id,title,note,kind,material_type,status,maintenance_analysis_id,created_at,updated_at,completed_at").eq("maintenance_request_id", requestId).order("created_at", { ascending: true }),
    supabase.from("maintenance_request_events").select("*").eq("maintenance_request_id", requestId).order("created_at", { ascending: false }),
  ]);
  for (const result of [requestResult, entriesResult, attachmentsResult, analysesResult, requestItemsResult, eventsResult]) {
    if (result.error) throw result.error;
  }
  const analysisIds = (analysesResult.data || []).map((analysis) => analysis.id);
  const directItemsResult = analysisIds.length
    ? await supabase
      .from("items")
      .select("id,title,note,kind,material_type,status,maintenance_analysis_id,created_at,updated_at,completed_at")
      .in("maintenance_analysis_id", analysisIds)
      .is("maintenance_request_id", null)
      .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (directItemsResult.error) throw directItemsResult.error;
  return {
    request: requestResult.data,
    entries: entriesResult.data || [],
    attachments: attachmentsResult.data || [],
    analyses: analysesResult.data || [],
    items: [...(requestItemsResult.data || []), ...(directItemsResult.data || [])],
    events: eventsResult.data || [],
  };
}

export async function loadTenantMaintenanceDetail(requestId) {
  const [requestResult, entriesResult, attachmentsResult] = await Promise.all([
    supabase.from("maintenance_requests").select("id,workspace_id,property_id,unit_id,source_type,title,original_description,tenant_status,created_at,updated_at,resolved_at").eq("id", requestId).single(),
    supabase.from("maintenance_request_entries").select("id,entry_type,content,transcript,created_at").eq("maintenance_request_id", requestId).eq("visibility", "tenant").order("created_at", { ascending: true }),
    supabase.from("maintenance_attachments").select("id,entry_id,kind,file_name,mime_type,storage_path,created_at").eq("maintenance_request_id", requestId).eq("visibility", "tenant").order("created_at", { ascending: true }),
  ]);
  for (const result of [requestResult, entriesResult, attachmentsResult]) {
    if (result.error) throw result.error;
  }
  return {
    request: toTenantRequest(requestResult.data),
    entries: entriesResult.data || [],
    attachments: attachmentsResult.data || [],
  };
}

export async function submitMaintenanceRequest({
  workspaceId,
  propertyId,
  unitId,
  tenantMembershipId = null,
  user,
  description = "",
  audioFile = null,
  photoFiles = [],
  sourceType,
  title,
  visibility,
}) {
  const isTenant = Boolean(tenantMembershipId);
  const requestSource = sourceType || (isTenant
    ? audioFile ? "tenant-audio" : "tenant-text"
    : audioFile ? "admin-audio" : "admin-text");
  const requestTitle = title?.trim() || getRequestTitle(description, audioFile, isTenant);
  const { data: request, error } = await supabase
    .from("maintenance_requests")
    .insert({
      workspace_id: workspaceId,
      property_id: propertyId,
      unit_id: unitId || null,
      tenant_membership_id: tenantMembershipId,
      source_type: requestSource,
      submitter_id: user.id,
      submitter_email: user.email || null,
      title: requestTitle,
      original_description: description.trim(),
    })
    .select()
    .single();
  if (error) throw error;

  try {
    if (description.trim()) {
      await addMaintenanceEntry({
        requestId: request.id,
        user,
        authorType: isTenant ? "tenant" : "admin",
        entryType: "description",
        visibility,
        content: description.trim(),
      });
    }
    if (audioFile) {
      await addMaintenanceMedia({
        request,
        user,
        file: audioFile,
        authorType: isTenant ? "tenant" : "admin",
        entryType: "audio",
        visibility,
      });
    }
    for (const photoFile of photoFiles) {
      await addMaintenanceMedia({
        request,
        user,
        file: photoFile,
        authorType: isTenant ? "tenant" : "admin",
        entryType: "photo",
        visibility,
      });
    }
    await processMaintenanceRequest(request.id);
    return request;
  } catch (sourceError) {
    // The request is intentionally retained for safe retry if a later source or
    // AI call fails after the permanent case has been created.
    throw new Error(`Request saved, but additional processing failed: ${sourceError.message}`);
  }
}

export async function addMaintenanceInformation({ request, user, content = "", audioFile = null, photoFiles = [], visibility }) {
  const authorType = visibility === "tenant" ? "tenant" : "admin";
  if (content.trim()) {
    await addMaintenanceEntry({
      requestId: request.id,
      user,
      authorType,
      entryType: "note",
      visibility,
      content: content.trim(),
    });
  }
  if (audioFile) {
    await addMaintenanceMedia({ request, user, file: audioFile, authorType, entryType: "audio", visibility });
  }
  for (const photoFile of photoFiles) {
    await addMaintenanceMedia({ request, user, file: photoFile, authorType, entryType: "photo", visibility });
  }
  await processMaintenanceRequest(request.id);
}

export async function addMaintenanceEntry({ requestId, user, authorType, entryType, visibility, content = "" }) {
  const { data, error } = await supabase
    .from("maintenance_request_entries")
    .insert({
      maintenance_request_id: requestId,
      author_type: authorType,
      author_id: user.id,
      author_email: user.email || null,
      entry_type: entryType,
      visibility,
      content,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function addMaintenanceMedia({ request, user, file, authorType, entryType, visibility }) {
  const entry = await addMaintenanceEntry({
    requestId: request.id,
    user,
    authorType,
    entryType,
    visibility,
  });
  const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  const path = `${request.workspace_id}/${request.id}/${entry.id}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(MAINTENANCE_BUCKET)
    .upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("maintenance_attachments")
    .insert({
      maintenance_request_id: request.id,
      entry_id: entry.id,
      visibility,
      kind: getAttachmentKind(file, entryType === "audio" ? "audio" : "file"),
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      storage_path: path,
    })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(MAINTENANCE_BUCKET).remove([path]);
    throw error;
  }
  return data;
}

export async function getMaintenanceAttachmentUrl(path) {
  const { data, error } = await supabase.storage
    .from(MAINTENANCE_BUCKET)
    .createSignedUrl(path, 60 * 30);
  if (error) throw error;
  return data.signedUrl;
}

export async function processMaintenanceRequest(maintenanceRequestId, { forceRetry = false } = {}) {
  const { data, error } = await supabase.functions.invoke("process-maintenance-request", {
    body: { maintenanceRequestId, forceRetry },
  });
  if (error) {
    const detail = await readFunctionError(error);
    throw new Error(detail || error.message || "Maintenance processing failed.");
  }
  return data;
}

export async function approveMaintenanceItem(itemId) {
  const { error } = await supabase
    .from("items")
    .update({ status: "approved", completed_at: null, updated_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) throw error;
}

export async function rejectMaintenanceItem(itemId) {
  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) throw error;
}

function toTenantRequest(request) {
  if (!request) return request;
  return {
    id: request.id,
    workspace_id: request.workspace_id,
    property_id: request.property_id,
    unit_id: request.unit_id,
    source_type: request.source_type,
    title: request.title,
    original_description: request.original_description,
    status: request.tenant_status || "received",
    created_at: request.created_at,
    updated_at: request.updated_at,
    resolved_at: request.resolved_at,
  };
}

function getRequestTitle(description, audioFile, isTenant) {
  const firstSentence = description.trim().split(/[.!?\n]/)[0].trim();
  if (firstSentence) return firstSentence.slice(0, 140);
  if (audioFile) return isTenant ? "Voice maintenance request" : "Admin voice intake";
  return "Maintenance request";
}

async function readFunctionError(error) {
  try {
    const body = await error.context?.json();
    return body?.error || body?.message;
  } catch {
    return null;
  }
}
