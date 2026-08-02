import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

type TaskDraftItem = {
  title: string;
  note: string;
  kind: "task";
  material_type: "none";
};

type MaterialDraftItem = {
  title: string;
  note: string;
  kind: "material";
  material_type: "shopping" | "collect";
};

type DraftItem = TaskDraftItem | MaterialDraftItem;

const materialLabels: Record<"shopping" | "collect", string> = {
  shopping: "Shopping List",
  collect: "Collect / Bring",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) {
        return jsonResponse({ error: "Authentication required." }, 401);
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
      const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
      const openAiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
      const transcriptionModel = Deno.env.get("OPENAI_TRANSCRIPTION_MODEL") || "gpt-4o-transcribe";

      if (!supabaseUrl || !supabaseAnonKey) {
        return jsonResponse({ error: "Supabase function environment is not configured." }, 503);
      }

      if (!openAiApiKey) {
        return jsonResponse({ error: "OpenAI credentials are not configured." }, 503);
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        return jsonResponse({ error: "Authentication required." }, 401);
      }

      const { propertyId, unitId, dictationItemId, attachmentId } = await request.json();
      if (!propertyId || !dictationItemId || !attachmentId) {
        return jsonResponse({ error: "propertyId, dictationItemId, and attachmentId are required." }, 400);
      }

      const { data: property, error: propertyError } = await supabase
        .from("properties")
        .select("id, workspace_id, name")
        .eq("id", propertyId)
        .single();
      if (propertyError || !property) {
        return jsonResponse({ error: "You do not have access to this property." }, 403);
      }

      let unit: { id: string; name: string } | null = null;
      if (unitId) {
        const { data, error } = await supabase
          .from("units")
          .select("id, name")
          .eq("id", unitId)
          .eq("property_id", propertyId)
          .single();
        if (error || !data) {
          return jsonResponse({ error: "The selected unit does not belong to this property." }, 400);
        }
        unit = data;
      }

      let attachmentQuery = supabase
        .from("attachments")
        .select("id, item_id, property_id, unit_id, kind, file_name, mime_type, storage_path")
        .eq("id", attachmentId)
        .eq("property_id", propertyId)
        .eq("item_id", dictationItemId)
      attachmentQuery = unitId
        ? attachmentQuery.eq("unit_id", unitId)
        : attachmentQuery.is("unit_id", null);
      const { data: attachment, error: attachmentError } = await attachmentQuery.single();
      if (attachmentError) throw attachmentError;
      if (attachment.kind !== "audio") {
        return jsonResponse({ error: "The selected attachment is not an audio recording." }, 400);
      }

      const { data: audioBlob, error: downloadError } = await supabase.storage
        .from("turnover-attachments")
        .download(attachment.storage_path);
      if (downloadError) throw downloadError;

      const transcript = await transcribeAudio({
        apiKey: openAiApiKey,
        model: transcriptionModel,
        fileName: attachment.file_name,
        audioBlob,
      });
      const draftedItems = ensureDraftItems(await draftItems({
        apiKey: openAiApiKey,
        model: openAiModel,
        propertyName: property.name,
        unitName: unit?.name || null,
        transcript,
      }), transcript);

      let lastItemQuery = supabase
        .from("items")
        .select("sort_order")
        .eq("property_id", propertyId)
        .order("sort_order", { ascending: false })
        .limit(1);
      lastItemQuery = unitId
        ? lastItemQuery.eq("unit_id", unitId)
        : lastItemQuery.is("unit_id", null);
      const { data: currentLastItem } = await lastItemQuery.maybeSingle();
      const nextSortOrder = (currentLastItem?.sort_order || 0) + 1;

      const rows = draftedItems.map((item, index) => ({
        workspace_id: property.workspace_id,
        property_id: propertyId,
        unit_id: unitId || null,
        title: item.title,
        note: item.note || "",
        category: getDraftCategory(item),
        kind: item.kind,
        material_type: item.kind === "material" ? item.material_type : null,
        status: "pending-review",
        sort_order: nextSortOrder + index,
      }));

      let createdItems: Array<Record<string, unknown>> = [];
      if (rows.length > 0) {
        const { data, error } = await supabase.from("items").insert(rows).select();
        if (error) throw error;
        createdItems = data || [];
      }

      await supabase
        .from("items")
        .update({
          note: `Transcript:\n${transcript}`,
          status: "done",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", dictationItemId)
        .eq("property_id", propertyId);

      return jsonResponse({
        transcript,
        items: createdItems,
      });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "AI drafting failed." }, 500);
    }
  },
};

async function transcribeAudio({ apiKey, model, fileName, audioBlob }: {
  apiKey: string;
  model: string;
  fileName: string;
  audioBlob: Blob;
}) {
  const body = new FormData();
  body.append("model", model);
  body.append("file", audioBlob, fileName || "dictation.webm");
  body.append("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "OpenAI transcription failed.");
  }

  const transcript = data?.text?.trim();
  if (!transcript) {
    throw new Error("OpenAI returned an empty transcript.");
  }
  return transcript;
}

async function draftItems({ apiKey, model, propertyName, unitName, transcript }: {
  apiKey: string;
  model: string;
  propertyName: string;
  unitName: string | null;
  transcript: string;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content:
            "You convert casual rental turnover voice notes into concise draft work items. Create practical pending-review tasks or materials from implied repair, cleaning, buying, bringing, checking, or follow-up needs. Use kind='material' for things to buy or bring. Use material_type='shopping' for items to buy and 'collect' for owned tools/materials to bring. Use kind='task' and material_type='none' for work to perform. If the transcript is unclear but non-empty, create one task titled 'Review dictated update' with the transcript summarized in the note.",
        },
        {
          role: "user",
          content: `Property: ${propertyName}\nScope: ${unitName || "Whole Property"}\n\nTranscript:\n${transcript}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "turnover_draft_items",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["items"],
            properties: {
              items: {
                type: "array",
                maxItems: 20,
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
          },
        },
      },
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "OpenAI draft creation failed.");
  }

  const outputText = getOutputText(data);
  const parsed = JSON.parse(outputText);
  return sanitizeDraftItems(parsed?.items || []);
}

function getOutputText(responseBody: Record<string, unknown>) {
  if (typeof responseBody.output_text === "string") return responseBody.output_text;

  const output = Array.isArray(responseBody.output) ? responseBody.output : [];
  const text = output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !("content" in item)) return [];
      return Array.isArray(item.content) ? item.content : [];
    })
    .map((content) => {
      if (!content || typeof content !== "object" || !("text" in content)) return "";
      return typeof content.text === "string" ? content.text : "";
    })
    .join("")
    .trim();
  if (!text) throw new Error("OpenAI returned no draft content.");
  return text;
}

function sanitizeDraftItems(items: Array<Record<string, unknown>>): DraftItem[] {
  return items
    .map((item): DraftItem => {
      const title = typeof item.title === "string" ? item.title.trim() : "";
      const note = typeof item.note === "string" ? item.note.trim() : "";
      if (item.kind === "material") {
        return {
          title,
          note,
          kind: "material",
          material_type: item.material_type === "collect" ? "collect" : "shopping",
        };
      }

      return {
        title,
        note,
        kind: "task",
        material_type: "none",
      };
    })
    .filter((item) => item.title.length > 0);
}

function ensureDraftItems(items: DraftItem[], transcript: string): DraftItem[] {
  if (items.length > 0) return items;

  return [{
    title: "Review dictated update",
    note: transcript.slice(0, 500),
    kind: "task",
    material_type: "none",
  }];
}

function getDraftCategory(item: DraftItem) {
  if (item.kind === "material") {
    return materialLabels[item.material_type];
  }

  return "Task";
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
