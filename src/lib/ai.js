import { supabase } from "./supabase";

export async function draftTasksFromDictation({ unitId, dictationItemId, attachmentId }) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.functions.invoke("draft-tasks", {
    body: { unitId, dictationItemId, attachmentId },
  });

  if (error) {
    const detail = await readFunctionError(error);
    throw new Error(detail || error.message || "AI drafting failed.");
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
