import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

type Snapshot = {
  requestId: string; propertyId: string; propertyName: string; unitName: string;
  description: string; contactName?: string; contactEmail?: string; contactPhone?: string;
  propertySlug: string; unitSlug: string;
};
type Config = { enabled?: string; jobSecret?: string; apiKey?: string; from?: string; appUrl?: string };
type Delivery = {
  id: string; request_id: string; recipient_email: string; snapshot: Snapshot;
  attempts: number; attempt_id: string; email_payload: Record<string, unknown> | null;
};

const validEmail = (value: string) => /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(value);
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function buildListingInquiryEmail(snapshot: Snapshot, recipient: string, from: string, appUrl: string) {
 if (!validEmail(recipient) || !snapshot.contactEmail || !validEmail(snapshot.contactEmail)) throw new Error("invalid_email");
 const base = new URL(appUrl);
 if (base.protocol !== 'https:' || base.username || base.password) throw new Error('invalid_app_url');
 const link = new URL(`${encodeURIComponent(snapshot.propertySlug)}/${encodeURIComponent(snapshot.unitSlug)}/`, base);
 const home = [snapshot.propertyName, snapshot.unitName].filter(Boolean).join(' · ');
 const text = `New rental inquiry\n\n${home}\n\nName: ${snapshot.contactName}\nEmail: ${snapshot.contactEmail}\n\n${snapshot.description}\n\nView listing: ${link}\n\nReply to this email to contact the sender.`;
 return { from, to: [recipient], reply_to: snapshot.contactEmail,
 subject: `Rental inquiry · ${home}`.replace(/[\r\n]/g, ' ').slice(0,200), text,
 html: `<h1>New rental inquiry</h1><h2>${escapeHtml(home)}</h2><p>Name: ${escapeHtml(snapshot.contactName)}<br>Email: ${escapeHtml(snapshot.contactEmail)}</p><p>${escapeHtml(snapshot.description).replace(/\n/g,'<br>')}</p><p><a href="${escapeHtml(link)}">View listing</a></p><p>Reply to this email to contact the sender.</p>` };
}

export async function handleListingInquiryEmailDelivery(request: Request, service: SupabaseClient, config: Config, fetcher: typeof fetch = fetch) {
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  if (!config.jobSecret || config.jobSecret.length < 32) return response({ error: "not_configured" }, 503);
  if (!await sameSecret(request.headers.get("authorization") || "", `Bearer ${config.jobSecret}`)) return response({ error: "unauthorized" }, 401);
  if (config.enabled !== "true") return response({ paused: true }, 200);
  if (!config.apiKey || !config.from || !config.appUrl) return response({ error: "not_configured" }, 503);
  let processed = 0;
  let sent = 0;
  for (let index = 0; index < 5; index++) {
    const { data, error: claimError } = await service.rpc("claim_listing_inquiry_email");
    if (claimError) {
      console.error("listing-inquiry-email", { stage: "claim_failed" });
      return response({ error: "queue_unavailable", processed, sent }, 503);
    }
    const delivery = data as Delivery | null;
    if (!delivery) break;
    processed++;
    const log = (stage: string, errorCode?: string) => console.info("listing-inquiry-email", {
      stage, deliveryId: delivery.id, requestId: delivery.request_id, attempt: delivery.attempts, ...(errorCode ? { errorCode } : {}),
    });
    let providerId: string | null = null;
    let errorCode: string | null = null;
    let retryable = true;
    try {
      let payload;
      try {
        payload = delivery.email_payload || buildListingInquiryEmail(delivery.snapshot, delivery.recipient_email, config.from, config.appUrl);
      } catch {
        retryable = false;
        throw new Error("invalid_email_data");
      }
      const { data: prepared, error } = await service.rpc("prepare_listing_inquiry_email", {
        target_id: delivery.id, target_attempt_id: delivery.attempt_id, payload,
      });
      if (error) throw new Error("prepare_failed");
      if (!prepared) { log("cancelled"); continue; }
      const result = await fetcher("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `listing-inquiry/${delivery.id}` },
        body: JSON.stringify(prepared),
      });
      const body = await result.json().catch(() => null);
      if (!result.ok) {
        retryable = [408, 409, 429].includes(result.status) || result.status >= 500;
        errorCode = `provider_${result.status}`;
      } else if (typeof body?.id === "string" && body.id.length > 0 && body.id.length <= 100) {
        providerId = body.id;
      } else errorCode = "unexpected_response";
    } catch (error) {
      errorCode = error instanceof Error && ["invalid_email_data", "prepare_failed"].includes(error.message) ? error.message : "network_error";
    }
    const { data: finished, error: finishError } = await service.rpc("finish_listing_inquiry_email", {
      target_id: delivery.id, target_attempt_id: delivery.attempt_id,
      provider_id: providerId, error_code: errorCode, retryable,
    });
    if (finishError || !finished) {
      // Leave the lease alone. If the provider accepted the email, the next
      // attempt uses the saved payload/key to recover without a second email.
      log("receipt_update_failed");
    } else {
      if (providerId) sent++;
      log(providerId ? "provider_accepted" : "send_failed", errorCode || undefined);
    }
  }
  return response({ processed, sent });
}

async function sameSecret(actual: string, expected: string) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([actual, expected].map(async value => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))));
  let different = 0;
  for (let index = 0; index < left.length; index++) different |= left[index] ^ right[index];
  return different === 0;
}
function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
