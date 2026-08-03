import { supabase } from "./supabase";
import { WORKSPACE_NAME } from "./seed";

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function watchAuth(callback) {
  if (!supabase) return () => {};
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => subscription.unsubscribe();
}

export async function signInWithGoogle() {
  if (!supabase) return;
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function loadWorkspace() {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id,name")
    .eq("name", WORKSPACE_NAME)
    .single();

  if (error) throw error;
  return data;
}

export async function loadUnits(workspaceId) {
  const { data, error } = await supabase
    .from("units")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function loadProperties(workspaceId) {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function loadWorkspaceMembers(workspaceId) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("id,email,role")
    .eq("workspace_id", workspaceId)
    .order("email", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function loadPropertyMembers(workspaceId) {
  const { data, error } = await supabase
    .from("property_members")
    .select("property_id,email,role")
    .eq("workspace_id", workspaceId);

  if (error) throw error;
  return data || [];
}

export async function setPropertyMemberAccess({ workspaceId, email, propertyIds }) {
  const { error } = await supabase.rpc("set_property_member_access", {
    target_workspace_id: workspaceId,
    target_email: email,
    target_property_ids: propertyIds,
  });

  if (error) throw error;
}

export async function loadPortfolioOverview(workspaceId) {
  const [itemsResult, activityResult] = await Promise.all([
    supabase
      .from("items")
      .select("id,property_id,unit_id,title,kind,material_type,status,created_at,updated_at,completed_at")
      .eq("workspace_id", workspaceId),
    supabase
      .from("activity_log")
      .select("id,property_id,unit_id,action,label,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(250),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (activityResult.error) throw activityResult.error;
  return {
    items: itemsResult.data || [],
    activityLog: activityResult.data || [],
  };
}

export async function loadItems({ propertyId, unitId }) {
  let query = supabase
    .from("items")
    .select("*, attachments(*)")
    .eq("property_id", propertyId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  query = unitId ? query.eq("unit_id", unitId) : query.is("unit_id", null);
  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function loadActivityLog({ propertyId, unitId }) {
  let query = supabase
    .from("activity_log")
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(100);

  query = unitId ? query.eq("unit_id", unitId) : query.is("unit_id", null);
  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export function watchScopeData({ propertyId, unitId }, callback) {
  if (!supabase || !propertyId) return () => {};

  const filter = unitId ? `unit_id=eq.${unitId}` : `property_id=eq.${propertyId}`;
  const scopeKey = unitId || `property-${propertyId}`;

  const channel = supabase
    .channel(`scope-${scopeKey}-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "items", filter }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "attachments", filter }, callback)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log", filter }, callback)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function watchPortfolioData(workspaceId, callback) {
  if (!supabase || !workspaceId) return () => {};

  const filter = `workspace_id=eq.${workspaceId}`;
  const channel = supabase
    .channel(`portfolio-${workspaceId}-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "items", filter }, callback)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log", filter }, callback)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function addItem(item) {
  const { data, error } = await supabase.from("items").insert(item).select().single();
  if (error) throw error;
  return data;
}

export async function updateItem(id, patch) {
  const { data, error } = await supabase
    .from("items")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateItemsStatus(ids, status) {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("items")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids)
    .select();

  if (error) throw error;
  return data || [];
}

export async function deleteItem(id) {
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadAttachment({ workspaceId, propertyId, unitId, itemId, file, kind }) {
  const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  const scopePath = unitId || "whole-property";
  const path = `${workspaceId}/${propertyId}/${scopePath}/${itemId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("turnover-attachments")
    .upload(path, file, { upsert: false });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      workspace_id: workspaceId,
      property_id: propertyId,
      unit_id: unitId || null,
      item_id: itemId,
      kind,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      storage_path: path,
      delete_after: kind === "audio" ? getThreeYearDeleteDate() : null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAttachment(attachment) {
  const { error: removeError } = await supabase.storage
    .from("turnover-attachments")
    .remove([attachment.storage_path]);
  if (removeError) throw removeError;

  const { error } = await supabase.from("attachments").delete().eq("id", attachment.id);
  if (error) throw error;
}

export async function getAttachmentUrl(path) {
  const { data, error } = await supabase.storage
    .from("turnover-attachments")
    .createSignedUrl(path, 60 * 30);
  if (error) throw error;
  return data.signedUrl;
}

function getThreeYearDeleteDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 3);
  return date.toISOString();
}
