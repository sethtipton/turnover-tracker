import { supabase } from "./supabase";

export async function draftTasksFromDictation({ propertyId, unitId, dictationItemId, attachmentId }) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.functions.invoke("draft-tasks", {
    body: { propertyId, unitId: unitId || null, dictationItemId, attachmentId },
  });

  if (error) {
    const detail = await readFunctionError(error);
    throw new Error(detail || error.message || "AI drafting failed.");
  }
  return data;
}

export async function draftListingField({ propertyId, unitId, field }) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.functions.invoke("draft-listing-copy", {
    body: { propertyId, unitId, field },
  });

  if (error) {
    const detail = await readFunctionError(error);
    throw new Error(detail || error.message || "AI listing suggestion failed.");
  }
  return data;
}

async function readFunctionError(error) {
  try {
    const body = await error.context?.json();
    return body?.error || body?.message;
  } catch {
    return null;
  }
}
