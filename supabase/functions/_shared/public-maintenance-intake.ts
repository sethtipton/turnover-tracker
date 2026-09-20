import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { hashMaintenanceCapabilityToken, isMaintenanceCapabilityToken } from "./maintenance-capability.ts";

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

export async function handlePublicMaintenanceRequest(request: Request, service: SupabaseClient) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  const correlationId = crypto.randomUUID();
  const startedAt = Date.now();
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return await handleContextRequest(request, service);
    if (contentType.includes("multipart/form-data")) return await handleSubmissionRequest(request, service, correlationId);
    return jsonResponse({ error: "Invalid request." }, 400);
  } catch (error) {
    // Error messages can contain user input, object paths, or credentials.
    console.error("public-maintenance-intake", { correlationId, stage: "failed", durationMs: Date.now() - startedAt, errorCode: errorCode(error) });
    return jsonResponse({ error: "We couldn’t complete that request. Please try again.", correlationId }, 500);
  }
}

async function handleContextRequest(request: Request, service: SupabaseClient) {
  const body = await request.json().catch(() => null);
  if (!isRecord(body) || body.action !== "inspect" || Object.keys(body).some((key) => key !== "action" && key !== "token")) {
    return jsonResponse({ error: "Invalid maintenance link." }, 400);
  }

  const scope = await resolveScope(service, body.token);
  if (!scope) return jsonResponse({ error: "This maintenance link is unavailable." }, 404);
  return jsonResponse({ propertyName: scope.property_name, unitName: scope.unit_name });
}

async function handleSubmissionRequest(request: Request, service: SupabaseClient, correlationId: string) {
  const form = await request.formData();
  const allowedKeys = new Set(["action", "token", "submissionId", "description", "contactName", "contactEmail", "contactPhone", "photos", "audio", "website"]);
  if ([...form.keys()].some((key) => !allowedKeys.has(key)) || text(form.get("action")) !== "submit") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }

  // A silent honeypot keeps low-effort bots from learning whether a capability
  // is valid and avoids creating junk operational records.
  if (text(form.get("website")).trim()) return jsonResponse({ received: true }, 202);

  const token = text(form.get("token"));
  const submissionId = text(form.get("submissionId"));
  const description = text(form.get("description")).trim();
  const contactName = text(form.get("contactName")).trim();
  const contactEmail = text(form.get("contactEmail")).trim();
  const contactPhone = text(form.get("contactPhone")).trim();
  const uploadsResult = await validateUploads(form);
  if (uploadsResult instanceof Response) return uploadsResult;
  const uploads = uploadsResult;

  if (!isMaintenanceCapabilityToken(token)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(submissionId)
    || description.length > MAX_DESCRIPTION_LENGTH
    || contactName.length > MAX_CONTACT_NAME_LENGTH
    || contactEmail.length > MAX_CONTACT_EMAIL_LENGTH
    || contactPhone.length > MAX_CONTACT_PHONE_LENGTH
    || (contactEmail && !isEmail(contactEmail))
    || (!description && uploads.length === 0)) {
    return jsonResponse({ error: "Please check the request details and try again." }, 400);
  }

  const startedAt = Date.now();
  const requestData = { description, contactName, contactEmail, contactPhone,
    title: getRequestTitle(description, uploads.some((upload) => upload.kind === "audio")) };
  const payloadHash = await hashSubmissionPayload(requestData, uploads);
  const { data: claim, error: claimError } = await service.rpc("claim_public_maintenance_submission", {
    target_token_hash: await hashMaintenanceCapabilityToken(token),
    target_submission_id: submissionId,
    target_payload_hash: payloadHash,
  });
  if (claimError) throw claimError;
  if (claim?.status === "completed") return jsonResponse({ received: true }, 200);
  if (claim?.status === "invalid") return jsonResponse({ error: "This maintenance link is unavailable." }, 404);
  if (claim?.status === "throttled") return jsonResponse({ error: "Please wait 30 seconds before sending another request." }, 429);
  if (claim?.status === "processing") return jsonResponse({ error: "Your request is still being saved. Wait a moment, then try again.", code: "processing" }, 409);
  if (claim?.status === "conflict") return jsonResponse({ error: "This request was already attempted with different details. Retry the original request before starting another.", code: "conflict" }, 409);
  if (claim?.status !== "claimed") throw new Error("Unexpected claim result");

  const log = (stage: string, extra: Record<string, unknown> = {}) => console.info("public-maintenance-intake", {
    correlationId, submissionId, requestId: claim.request_id, stage,
    attachmentCount: uploads.length, durationMs: Date.now() - startedAt, ...extra,
  });
  const media = uploads.map((upload) => {
    const entryId = crypto.randomUUID();
    return { entry_id: entryId, kind: upload.kind, mime_type: upload.mimeType,
      file_name: safeDisplayName(upload.file.name, upload.kind, upload.extension),
      storage_path: `${claim.workspace_id}/${claim.request_id}/${entryId}/${claim.attempt_id}.${upload.extension}` };
  });
  const paths = media.map((attachment) => attachment.storage_path);
  let stage = "claimed";
  log(stage);
  try {
    if (claim.cleanup_paths?.length) {
      const { error } = await service.storage.from(MAINTENANCE_BUCKET).remove(claim.cleanup_paths);
      if (error) log("previous-upload-cleanup-failed", { errorCode: errorCode(error) });
    }
    const { error: manifestError } = await service.from("maintenance_public_submissions")
      .update({ upload_paths: paths }).eq("id", submissionId).eq("attempt_id", claim.attempt_id);
    if (manifestError) throw manifestError;
    stage = "uploading";
    for (const [index, upload] of uploads.entries()) {
      const { error } = await service.storage.from(MAINTENANCE_BUCKET)
        .upload(media[index].storage_path, upload.file, { contentType: upload.mimeType, upsert: false });
      if (error) throw error;
    }
    stage = "finalizing";
    const { error } = await service.rpc("finalize_public_maintenance_submission", {
      target_submission_id: submissionId, target_attempt_id: claim.attempt_id,
      request_data: requestData, media,
    });
    if (error) throw error;
    log("completed");
    return jsonResponse({ received: true }, 201);
  } catch (error) {
    log("attempt-failed", { failedStage: stage, errorCode: errorCode(error) });
    const { data: outcome, error: abortError } = await service.rpc("fail_public_maintenance_submission", {
      target_submission_id: submissionId, target_attempt_id: claim.attempt_id,
    });
    if (!abortError && outcome === "completed") {
      log("completed-after-response-loss");
      return jsonResponse({ received: true }, 200);
    }
    if (!abortError && outcome === "failed" && paths.length) {
      const { error: cleanupError } = await service.storage.from(MAINTENANCE_BUCKET).remove(paths);
      log(cleanupError ? "upload-cleanup-failed" : "uploads-cleaned", cleanupError ? { errorCode: errorCode(cleanupError) } : {});
    }
    // If status cannot be established, retain the uploads and receipt for retry.
    // Never remove files that might belong to an already committed case.
    throw error;
  }
}

export async function hashSubmissionPayload(details: Record<string, string>, uploads: Upload[]) {
  const files = await Promise.all(uploads.map(async (upload) => ({
    name: safeDisplayName(upload.file.name, upload.kind, upload.extension),
    kind: upload.kind, type: upload.mimeType,
    hash: await digest(await upload.file.arrayBuffer()),
  })));
  return digest(new TextEncoder().encode(JSON.stringify({ details, files })));
}

async function digest(value: BufferSource) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", value)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function errorCode(error: unknown) {
  const code = isRecord(error) ? error.code || error.name : null;
  return typeof code === "string" && /^[a-zA-Z0-9_]{1,40}$/.test(code) ? code : "unknown";
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
