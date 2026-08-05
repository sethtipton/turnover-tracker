import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

type ListingField = "listing_headline" | "listing_description" | "amenities";

const validFields = new Set<ListingField>([
  "listing_headline",
  "listing_description",
  "amenities",
]);

const fieldInstructions: Record<ListingField, { label: string; maxLength: number; instruction: string }> = {
  listing_headline: {
    label: "listing headline",
    maxLength: 120,
    instruction: "Write one concise, factual headline. Do not add a period.",
  },
  listing_description: {
    label: "public listing description",
    maxLength: 900,
    instruction: "Write a concise, factual two-to-three sentence description in plain text. Do not use markdown or a title.",
  },
  amenities: {
    label: "amenities",
    maxLength: 500,
    instruction: "Return three to eight factual amenities, one per line, without bullets or introductory text.",
  },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
      const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
      const openAiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
      if (!supabaseUrl || !supabaseAnonKey) {
        return jsonResponse({ error: "Supabase function environment is not configured." }, 503);
      }
      if (!openAiApiKey) return jsonResponse({ error: "OpenAI credentials are not configured." }, 503);

      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) return jsonResponse({ error: "Authentication required." }, 401);

      const { propertyId, unitId, field } = await request.json();
      if (!propertyId || !unitId || !isListingField(field)) {
        return jsonResponse({ error: "propertyId, unitId, and a valid field are required." }, 400);
      }

      const { data: property, error: propertyError } = await supabase
        .from("properties")
        .select("id, name, public_name, property_type, city, state, neighborhood")
        .eq("id", propertyId)
        .single();
      if (propertyError || !property) {
        return jsonResponse({ error: "You do not have access to this property." }, 403);
      }

      const { data: unit, error: unitError } = await supabase
        .from("units")
        .select("id, name, unit_number, monthly_rent, rent_display_type, available_date, lease_term, bedrooms, full_bathrooms, half_bathrooms, interior_square_feet, amenities")
        .eq("id", unitId)
        .eq("property_id", propertyId)
        .single();
      if (unitError || !unit) {
        return jsonResponse({ error: "The selected unit does not belong to this property." }, 400);
      }

      const suggestion = await draftListingCopy({
        apiKey: openAiApiKey,
        model: openAiModel,
        field,
        property,
        unit,
      });
      return jsonResponse({ field, suggestion });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "AI listing suggestion failed." }, 500);
    }
  },
};

async function draftListingCopy({ apiKey, model, field, property, unit }: {
  apiKey: string;
  model: string;
  field: ListingField;
  property: Record<string, unknown>;
  unit: Record<string, unknown>;
}) {
  const fieldConfig = fieldInstructions[field];
  const facts = JSON.stringify({ property, unit });
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
          content: [
            "You draft neutral, factual rental listing copy from the supplied facts only.",
            "Never invent or infer a feature, condition, policy, utility, parking arrangement, school detail, neighborhood claim, or availability detail.",
            "Do not express or imply a preference, limitation, or discrimination involving any current or prospective resident. Do not mention protected characteristics, household composition, schools, or a preferred type of renter.",
            "Return an empty string when the supplied facts are not enough to make a useful suggestion.",
            fieldConfig.instruction,
          ].join(" "),
        },
        {
          role: "user",
          content: `Create a ${fieldConfig.label} from these verified property facts:\n${facts}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "listing_copy_suggestion",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["suggestion"],
            properties: {
              suggestion: { type: "string", maxLength: fieldConfig.maxLength },
            },
          },
        },
      },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI listing suggestion failed.");

  const parsed = JSON.parse(getOutputText(data));
  const suggestion = typeof parsed?.suggestion === "string" ? parsed.suggestion.trim() : "";
  if (!suggestion) throw new Error("AI could not find enough verified details to write this field.");
  return field === "amenities" ? cleanAmenities(suggestion) : suggestion;
}

function isListingField(value: unknown): value is ListingField {
  return typeof value === "string" && validFields.has(value as ListingField);
}

function cleanAmenities(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/^[-*•\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8)
    .join("\n");
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
  if (!text) throw new Error("OpenAI returned no listing suggestion.");
  return text;
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
