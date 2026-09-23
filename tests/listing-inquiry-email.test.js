import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildListingInquiryEmail, handleListingInquiryEmailDelivery } from "../supabase/functions/_shared/listing-inquiry-email.ts";

const snapshot = {
  requestId: "11111111-1111-4111-8111-111111111111", propertyId: "22222222-2222-4222-8222-222222222222",
  propertyName: "Carthage", unitName: "Main Unit", description: 'Tap leaks\n<script>alert("x")</script>',
  contactName: "Test tenant", contactEmail: "tenant@example.invalid", contactPhone: "555-0100", propertySlug: "carthage", unitSlug: "main-unit",
};
const config = { enabled: "true", jobSecret: "x".repeat(40), apiKey: "test-only", from: "Tree City Rentals <maintenance@example.invalid>", appUrl: "https://example.com/turnover-tracker/" };
const delivery = { id: "queue-id", request_id: snapshot.requestId, recipient_email: "admin@example.invalid", snapshot, attempts: 1, attempt_id: "attempt-id", email_payload: null };
const request = (auth = `Bearer ${config.jobSecret}`) => new Request("https://function.invalid", { method: "POST", headers: { Authorization: auth } });
function serviceFor(row = delivery) {
  let claimed = false;
  return { rpc: vi.fn(async (name, args) => {
    if (name === "claim_listing_inquiry_email") { const data = claimed ? null : row; claimed = true; return { data }; }
    if (name === "prepare_listing_inquiry_email") return { data: args.payload };
    return { data: true };
  }) };
}
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

it("rejects callers without the scheduler secret before accessing the queue", async () => {
  const service = serviceFor(); const fetcher = vi.fn();
  expect((await handleListingInquiryEmailDelivery(request("Bearer wrong"), service, config, fetcher)).status).toBe(401);
  expect(service.rpc).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});
it("does not claim notifications while paused or unconfigured", async () => {
  const service = serviceFor(); const fetcher = vi.fn();
  expect((await handleListingInquiryEmailDelivery(request(), service, { ...config, enabled: "false" }, fetcher)).status).toBe(200);
  expect((await handleListingInquiryEmailDelivery(request(), service, { ...config, apiKey: "" }, fetcher)).status).toBe(503);
  expect(service.rpc).not.toHaveBeenCalled();
});
it("sends once with a stable idempotency key and records provider acceptance", async () => {
  const service = serviceFor(); const fetcher = vi.fn(async () => Response.json({ id: "resend-id" }));
  const result = await handleListingInquiryEmailDelivery(request(), service, config, fetcher);
  expect(await result.json()).toEqual({ processed: 1, sent: 1 });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][0]).toBe("https://api.resend.com/emails");
  expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe("listing-inquiry/queue-id");
  expect(service.rpc).toHaveBeenCalledWith("finish_listing_inquiry_email", expect.objectContaining({ provider_id: "resend-id", error_code: null }));
  const logs = JSON.stringify(console.info.mock.calls);
  expect(logs).not.toContain(snapshot.contactEmail); expect(logs).not.toContain(snapshot.description); expect(logs).not.toContain(config.apiKey);
});
it("reuses the stored provider payload on retry even if configuration changes", async () => {
  const saved = buildListingInquiryEmail(snapshot, delivery.recipient_email, config.from, config.appUrl);
  const service = serviceFor({ ...delivery, attempts: 2, email_payload: saved });
  const fetcher = vi.fn(async () => Response.json({ id: "same-resend-id" }));
  await handleListingInquiryEmailDelivery(request(), service, { ...config, from: "Changed <changed@example.invalid>", appUrl: "https://new.example.com/" }, fetcher);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(saved);
});
it.each([429, 500, 503])("retries temporary provider HTTP %s failures", async status => {
  const service = serviceFor();
  await handleListingInquiryEmailDelivery(request(), service, config, async () => Response.json({ message: "private provider text" }, { status }));
  expect(service.rpc).toHaveBeenCalledWith("finish_listing_inquiry_email", expect.objectContaining({ provider_id: null, retryable: true, error_code: `provider_${status}` }));
  expect(JSON.stringify(console.info.mock.calls)).not.toContain("private provider text");
});
it("retries lost responses with the same queue identity", async () => {
  const service = serviceFor();
  await handleListingInquiryEmailDelivery(request(), service, config, async () => { throw new Error("response lost"); });
  expect(service.rpc).toHaveBeenCalledWith("finish_listing_inquiry_email", expect.objectContaining({ retryable: true, error_code: "network_error" }));
});
it("marks permanent provider errors for attention instead of repeatedly sending", async () => {
  const service = serviceFor();
  await handleListingInquiryEmailDelivery(request(), service, config, async () => Response.json({}, { status: 422 }));
  expect(service.rpc).toHaveBeenCalledWith("finish_listing_inquiry_email", expect.objectContaining({ retryable: false, error_code: "provider_422" }));
});
it("does not send when the recipient loses access between claiming and preparation", async () => {
  const service = serviceFor(); const original = service.rpc.getMockImplementation();
  service.rpc.mockImplementation((name, args) => name === "prepare_listing_inquiry_email" ? Promise.resolve({ data: null }) : original(name, args));
  const fetcher = vi.fn();
  await handleListingInquiryEmailDelivery(request(), service, config, fetcher);
  expect(fetcher).not.toHaveBeenCalled();
});
it("leaves a lost database acknowledgement recoverable without a second provider request", async () => {
  const service = serviceFor(); const original = service.rpc.getMockImplementation();
  service.rpc.mockImplementation((name, args) => name === "finish_listing_inquiry_email" ? Promise.resolve({ error: new Error("lost DB response") }) : original(name, args));
  const fetcher = vi.fn(async () => Response.json({ id: "resend-id" }));
  await handleListingInquiryEmailDelivery(request(), service, config, fetcher);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(console.info).toHaveBeenCalledWith("listing-inquiry-email", expect.objectContaining({ stage: "receipt_update_failed" }));
});

it('uses a private recipient, escaped content and sender Reply-To',()=>{
 const email=buildListingInquiryEmail(snapshot,delivery.recipient_email,config.from,config.appUrl);
 expect(email.to).toEqual(['admin@example.invalid']);
 expect(email.reply_to).toBe('tenant@example.invalid');
 expect(email.html).not.toContain('<script>');
 expect(email.text).toContain('https://example.com/turnover-tracker/carthage/main-unit/');
});
