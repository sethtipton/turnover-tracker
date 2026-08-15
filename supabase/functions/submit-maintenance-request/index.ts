import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { hashMaintenanceCapabilityToken, isMaintenanceCapabilityToken } from "../_shared/maintenance-capability.ts";

const MAINTENANCE_BUCKET = "maintenance-attachments";
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_CONTACT_NAME_LENGTH = 120;
const MAX_CONTACT_EMAIL_LENGTH = 254;
const MAX_CONTACT_PHONE_LENGTH = 50;
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

const imageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
]);

const audioTypes = new Map([
  ["audio/webm", "webm"],
  ["audio/mp4", "m4a"],
  ["audio/mpeg", "mp3"],
  ["audio/wav", "wav"],
  ["audio/aac", "aac"],
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CapabilityScope = {
  workspace_id: string;
  property_id: string;
  unit_id: string;
  property_name: string;
  unit_name: string;
};

type Upload = {
  file: File;
  kind: "photo" | "audio";
  extension: string;
  mimeType: string;
};

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "Maintenance intake is temporarily unavailable." }, 503);

      const service = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const contentType = request.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        return await handleContextRequest(request, service);
      }
      if (contentType.includes("multipart/form-data")) {
        return await handleSubmissionRequest(request, service);
      }
      return jsonResponse({ error: "Invalid request." }, 400);
    } catch (error) {
      console.error("public-maintenance-intake-failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
      return jsonResponse({ error: "We couldn’t complete that request. Please try again." }, 500);
    }
  },
};

async function handleContextRequest(request: Request, service: SupabaseClient) {
  const body = await request.json().catch(() => null);
  if (!isRecord(body) || body.action !== "inspect" || Object.keys(body).some((key) => key !== "action" && key !== "token")) {
    return jsonResponse({ error: "Invalid maintenance link." }, 400);
  }

  const scope = await resolveScope(service, body.token);
  if (!scope) return jsonResponse({ error: "This maintenance link is unavailable." }, 404);
  return jsonResponse({ propertyName: scope.property_name, unitName: scope.unit_name });
}

async function handleSubmissionRequest(request: Request, service: SupabaseClient) {
  const form = await request.formData();
  const allowedKeys = new Set(["action", "token", "description", "contactName", "contactEmail", "contactPhone", "photos", "audio", "website"]);
  if ([...form.keys()].some((key) => !allowedKeys.has(key)) || text(form.get("action")) !== "submit") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }

  // A silent honeypot keeps low-effort bots from learning whether a capability
  // is valid and avoids creating junk operational records.
  if (text(form.get("website")).trim()) return jsonResponse({ received: true }, 202);

  const token = text(form.get("token"));
  const description = text(form.get("description")).trim();
  const contactName = text(form.get("contactName")).trim();
  const contactEmail = text(form.get("contactEmail")).trim();
  const contactPhone = text(form.get("contactPhone")).trim();
  const uploadsResult = await validateUploads(form);
  if (uploadsResult instanceof Response) return uploadsResult;
  const uploads = uploadsResult;

  if (!isMaintenanceCapabilityToken(token)
    || description.length > MAX_DESCRIPTION_LENGTH
    || contactName.length > MAX_CONTACT_NAME_LENGTH
    || contactEmail.length > MAX_CONTACT_EMAIL_LENGTH
    || contactPhone.length > MAX_CONTACT_PHONE_LENGTH
    || (contactEmail && !isEmail(contactEmail))
    || (!description && uploads.length === 0)) {
    return jsonResponse({ error: "Please check the request details and try again." }, 400);
  }

  const tokenHash = await hashMaintenanceCapabilityToken(token);
  const { data: claimedScopes, error: claimError } = await service
    .rpc("claim_public_maintenance_submission", { target_token_hash: tokenHash });
  if (claimError) throw claimError;
  const scope = claimedScopes?.[0] as CapabilityScope | undefined;
  if (!scope) return jsonResponse({ error: "Please wait a moment before sending another request." }, 429);

  let requestId: string | null = null;
  const uploadedPaths: string[] = [];
  try {
    const title = getRequestTitle(description, uploads.some((upload) => upload.kind === "audio"));
    const { data: maintenanceRequest, error: requestError } = await service
      .from("maintenance_requests")
      .insert({
        workspace_id: scope.workspace_id,
        property_id: scope.property_id,
        unit_id: scope.unit_id,
        tenant_membership_id: null,
        source_type: "qr-public",
        submitter_id: null,
        submitter_email: null,
        reporter_name: contactName || null,
        reporter_email: contactEmail || null,
        reporter_phone: contactPhone || null,
        title,
        original_description: description,
      })
      .select("id")
      .single();
    if (requestError || !maintenanceRequest) throw requestError || new Error("Request was not created.");
    requestId = maintenanceRequest.id;

    if (description) {
      const { error } = await service.from("maintenance_request_entries").insert({
        maintenance_request_id: requestId,
        author_type: "tenant",
        author_id: null,
        author_email: contactEmail || null,
        entry_type: "description",
        visibility: "tenant",
        content: description,
      });
      if (error) throw error;
    }

    for (const upload of uploads) {
      const entry = await createMediaEntry(service, requestId, upload.kind, contactEmail || null);
      const path = `${scope.workspace_id}/${requestId}/${entry.id}/${crypto.randomUUID()}.${upload.extension}`;
      const { error: storageError } = await service.storage
        .from(MAINTENANCE_BUCKET)
        .upload(path, upload.file, { contentType: upload.mimeType, upsert: false });
      if (storageError) throw storageError;
      uploadedPaths.push(path);

      const { error: attachmentError } = await service.from("maintenance_attachments").insert({
        maintenance_request_id: requestId,
        entry_id: entry.id,
        visibility: "tenant",
        kind: upload.kind,
        file_name: safeDisplayName(upload.file.name, upload.kind, upload.extension),
        mime_type: upload.mimeType,
        storage_path: path,
      });
      if (attachmentError) throw attachmentError;
    }

    console.info("public-maintenance-submission", {
      capabilityFingerprint: tokenHash.slice(0, 12),
      attachmentCount: uploads.length,
    });
    return jsonResponse({ received: true }, 201);
  } catch (error) {
    if (uploadedPaths.length > 0) await service.storage.from(MAINTENANCE_BUCKET).remove(uploadedPaths);
    if (requestId) await service.from("maintenance_requests").delete().eq("id", requestId);
    throw error;
  }
}

async function resolveScope(service: SupabaseClient, token: unknown) {
  if (!isMaintenanceCapabilityToken(token)) return null;
  const tokenHash = await hashMaintenanceCapabilityToken(token);
  const { data, error } = await service
    .rpc("resolve_public_maintenance_capability", { target_token_hash: tokenHash });
  if (error) throw error;
  return (data?.[0] || null) as CapabilityScope | null;
}

async function validateUploads(form: FormData): Promise<Upload[] | Response> {
  const photos = form.getAll("photos").filter(isFile);
  const audioValues = form.getAll("audio").filter(isFile);
  const allFileValues = [...form.getAll("photos"), ...form.getAll("audio")];
  if (photos.length > MAX_PHOTOS || audioValues.length > 1 || allFileValues.length !== photos.length + audioValues.length) {
    return jsonResponse({ error: "You can add up to five photos and one voice recording." }, 400);
  }

  let totalSize = 0;
  const uploads: Upload[] = [];
  for (const photo of photos) {
    const mimeType = normalizedMimeType(photo.type);
    const extension = imageTypes.get(mimeType);
    if (!extension || photo.size === 0 || photo.size > MAX_PHOTO_BYTES || !await matchesFileSignature(photo, mimeType)) {
      return jsonResponse({ error: "Photos must be JPEG, PNG, WebP, or HEIC files up to 10 MB." }, 400);
    }
    totalSize += photo.size;
    uploads.push({ file: photo, kind: "photo", extension, mimeType });
  }
  for (const audio of audioValues) {
    const mimeType = normalizedMimeType(audio.type);
    const extension = audioTypes.get(mimeType);
    if (!extension || audio.size === 0 || audio.size > MAX_AUDIO_BYTES || !await matchesFileSignature(audio, mimeType)) {
      return jsonResponse({ error: "Voice recordings must be a supported audio file up to 20 MB." }, 400);
    }
    totalSize += audio.size;
    uploads.push({ file: audio, kind: "audio", extension, mimeType });
  }
  if (totalSize > MAX_TOTAL_BYTES) return jsonResponse({ error: "Attachments must total 30 MB or less." }, 400);
  return uploads;
}

function normalizedMimeType(value: string) {
  return value.split(";", 1)[0].trim().toLowerCase();
}

async function matchesFileSignature(file: File, mimeType: string) {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return ascii(0, 8) === "\x89PNG\r\n\x1a\n";
  if (mimeType === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (mimeType === "image/heic") return ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(ascii(8, 12));
  if (mimeType === "audio/webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (mimeType === "audio/mp4") return ascii(4, 8) === "ftyp";
  if (mimeType === "audio/mpeg") return ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (mimeType === "audio/wav") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
  if (mimeType === "audio/aac") return bytes[0] === 0xff && (bytes[1] === 0xf1 || bytes[1] === 0xf9);
  return false;
}

async function createMediaEntry(service: SupabaseClient, requestId: string, kind: "photo" | "audio", authorEmail: string | null) {
  const { data, error } = await service
    .from("maintenance_request_entries")
    .insert({
      maintenance_request_id: requestId,
      author_type: "tenant",
      author_id: null,
      author_email: authorEmail,
      entry_type: kind,
      visibility: "tenant",
      content: "",
    })
    .select("id")
    .single();
  if (error || !data) throw error || new Error("Attachment entry was not created.");
  return data;
}

function getRequestTitle(description: string, hasAudio: boolean) {
  const firstSentence = description.split(/[.!?\n]/)[0]?.trim();
  if (firstSentence) return firstSentence.slice(0, 140);
  return hasAudio ? "Voice maintenance request" : "Photo maintenance request";
}

function safeDisplayName(value: string, kind: "photo" | "audio", extension: string) {
  const base = value
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return `${base || kind}.${extension}`;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: FormDataEntryValue | unknown) {
  return typeof value === "string" ? value : "";
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string" && value instanceof File;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
