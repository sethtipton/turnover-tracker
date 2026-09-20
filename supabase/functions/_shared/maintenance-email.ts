import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

type Snapshot = {
  requestId: string; propertyId: string; propertyName: string; unitName: string;
  description: string; contactName?: string; contactEmail?: string; contactPhone?: string;
  photoCount: number; audioCount: number;
};
type Config = { enabled?: string; jobSecret?: string; apiKey?: string; from?: string; appUrl?: string };
type Delivery = {
  id: string; request_id: string; recipient_email: string; snapshot: Snapshot;
  attempts: number; attempt_id: string; email_payload: Record<string, unknown> | null;
};

const validEmail = (value: string) => /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(value);
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function buildMaintenanceEmail(snapshot: Snapshot, recipient: string, from: string, appUrl: string) {
  if (!validEmail(recipient)) throw new Error("invalid_recipient");
  if (!/^[a-f0-9-]{36}$/i.test(snapshot.requestId) || !/^[a-f0-9-]{36}$/i.test(snapshot.propertyId)) throw new Error("invalid_scope");
  const base = new URL(appUrl);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) throw new Error("invalid_app_url");
  if (base.username || base.password) throw new Error("invalid_app_url");
  base.pathname = base.pathname.replace(/\/?$/, "/");
  base.search = ""; base.hash = "";
  const link = new URL("maintenance/", base);
  link.searchParams.set("property", snapshot.propertyId);
  link.searchParams.set("request", snapshot.requestId);
  const home = snapshot.unitName?.trim().toLowerCase() === "main unit"
    ? snapshot.propertyName : [snapshot.propertyName, snapshot.unitName].filter(Boolean).join(" · ");
  const description = snapshot.description || "No written description. Open the request to review the attached media.";
  const attachments = `${snapshot.photoCount} photo${snapshot.photoCount === 1 ? "" : "s"} · ${snapshot.audioCount} voice message${snapshot.audioCount === 1 ? "" : "s"}`;
  const contact = [["Name", snapshot.contactName], ["Email", snapshot.contactEmail], ["Phone", snapshot.contactPhone]].filter(([, value]) => value);
  const replyTo = snapshot.contactEmail && validEmail(snapshot.contactEmail) ? snapshot.contactEmail : undefined;
  const replyHint = replyTo ? "Reply to this email to contact the person who submitted this request. Replies stay in email; they are not added to the app."
    : "No reply email was provided. Use any contact information above to follow up.";
  const text = ["New maintenance request", home, description, `Attachments: ${attachments}`,
    ...contact.map(([label, value]) => `${label}: ${value}`), `View request: ${link}`, replyHint].join("\n\n");
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f4f5f3;color:#18241e;font:16px/1.6 Arial,sans-serif"><main style="max-width:600px;margin:24px auto;padding:28px;background:#ffffff;border:1px solid #d8ded8;border-radius:8px"><p style="font-size:12px;font-weight:bold;letter-spacing:1px">TREE CITY RENTALS</p><h1 style="font-size:24px;line-height:1.3">New maintenance request</h1><h2 style="font-size:19px">${escapeHtml(home)}</h2><p>${escapeHtml(description).replace(/\n/g, "<br>")}</p><p><strong>Attachments:</strong> ${escapeHtml(attachments)}</p>${contact.map(([label, value]) => `<p><strong>${label}:</strong> ${escapeHtml(value)}</p>`).join("")}<p style="margin:28px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#e6bb62;color:#151107;border-radius:6px;text-decoration:none;font-weight:bold">View request</a></p><p style="font-size:13px;color:#526057">${replyHint}</p></main></body></html>`;
  // Strip control characters from the subject to prevent header injection.
  // eslint-disable-next-line no-control-regex
  return { from, to: [recipient], subject: `Maintenance request · ${home}`.replace(/[\r\n\x00-\x1f\x7f]/g, " ").slice(0, 200),
    html, text, ...(replyTo ? { reply_to: replyTo } : {}) };
}

export async function handleMaintenanceEmailDelivery(request: Request, service: SupabaseClient, config: Config, fetcher: typeof fetch = fetch) {
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  if (!config.jobSecret || config.jobSecret.length < 32) return response({ error: "not_configured" }, 503);
  if (!await sameSecret(request.headers.get("authorization") || "", `Bearer ${config.jobSecret}`)) return response({ error: "unauthorized" }, 401);
  if (config.enabled !== "true") return response({ paused: true }, 200);
  if (!config.apiKey || !config.from || !config.appUrl) return response({ error: "not_configured" }, 503);
  let processed = 0;
  let sent = 0;
  for (let index = 0; index < 5; index++) {
    const { data, error: claimError } = await service.rpc("claim_maintenance_email");
    if (claimError) {
      console.error("maintenance-email", { stage: "claim_failed" });
      return response({ error: "queue_unavailable", processed, sent }, 503);
    }
    const delivery = data as Delivery | null;
    if (!delivery) break;
    processed++;
    const log = (stage: string, errorCode?: string) => console.info("maintenance-email", {
      stage, deliveryId: delivery.id, requestId: delivery.request_id, attempt: delivery.attempts, ...(errorCode ? { errorCode } : {}),
    });
    let providerId: string | null = null;
    let errorCode: string | null = null;
    let retryable = true;
    try {
      let payload;
      try {
        payload = delivery.email_payload || buildMaintenanceEmail(delivery.snapshot, delivery.recipient_email, config.from, config.appUrl);
      } catch {
        retryable = false;
        throw new Error("invalid_email_data");
      }
      const { data: prepared, error } = await service.rpc("prepare_maintenance_email", {
        target_id: delivery.id, target_attempt_id: delivery.attempt_id, payload,
      });
      if (error) throw new Error("prepare_failed");
      if (!prepared) { log("cancelled"); continue; }
      const result = await fetcher("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `maintenance-request/${delivery.id}` },
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
    const { data: finished, error: finishError } = await service.rpc("finish_maintenance_email", {
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
