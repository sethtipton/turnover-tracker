import { beforeEach, describe, expect, it, vi } from "vitest";
import { handlePublicMaintenanceRequest, hashSubmissionPayload } from "../supabase/functions/_shared/public-maintenance-intake.ts";

const token = "a".repeat(43);
const submissionId = "11111111-1111-4111-8111-111111111111";
const png = () => new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0])], "test.png", { type: "image/png" });
function request(overrides = {}, files = []) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ action: "submit", token, submissionId, description: "Test leaking tap", ...overrides })) form.set(key, value);
  for (const file of files) form.append(file.type.startsWith("audio") ? "audio" : "photos", file);
  return new Request("https://example.test/intake", { method: "POST", body: form });
}
function service() {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: () => ({ eq: async () => ({ error: null }) }) }));
  const rpc = vi.fn(async (name) => {
    if (name === "claim_public_maintenance_submission") return { data: { status: "claimed", request_id: "case-id", attempt_id: "attempt-id", workspace_id: "workspace-id", cleanup_paths: [] } };
    if (name === "fail_public_maintenance_submission") return { data: "failed" };
    return { data: null, error: null };
  });
  return { rpc, from: vi.fn(() => ({ update })), storage: { from: vi.fn(() => ({ upload, remove })) }, upload, remove };
}
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("public maintenance intake", () => {
  it("saves a text/photo request only after uploading and passes server-owned media to finalization", async () => {
    const db = service();
    expect((await handlePublicMaintenanceRequest(request({}, [png()]), db)).status).toBe(201);
    const finalize = db.rpc.mock.calls.find(([name]) => name === "finalize_public_maintenance_submission")[1];
    expect(finalize.request_data.description).toBe("Test leaking tap");
    expect(finalize.media).toHaveLength(1);
    expect(finalize.media[0].storage_path).toMatch(/^workspace-id\/case-id\//);
    expect(db.upload.mock.invocationCallOrder[0]).toBeLessThan(db.rpc.mock.invocationCallOrder[1]);
  });
  it("acknowledges a completed retry without uploading or creating another case", async () => {
    const db = service(); db.rpc.mockResolvedValue({ data: { status: "completed" } });
    expect((await handlePublicMaintenanceRequest(request({}, [png()]), db)).status).toBe(200);
    expect(db.upload).not.toHaveBeenCalled(); expect(db.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([["invalid", 404], ["throttled", 429], ["processing", 409], ["conflict", 409]])("handles %s receipts without writing", async (status, expected) => {
    const db = service(); db.rpc.mockResolvedValue({ data: { status } });
    expect((await handlePublicMaintenanceRequest(request(), db)).status).toBe(expected);
    expect(db.from).not.toHaveBeenCalled();
  });
  it("rejects client-supplied scope and malformed IDs", async () => {
    const db = service();
    expect((await handlePublicMaintenanceRequest(request({ unit_id: "other-unit" }), db)).status).toBe(400);
    expect((await handlePublicMaintenanceRequest(request({ submissionId: "bad" }), db)).status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("rejects a file whose bytes do not match its image MIME type before claiming", async () => {
    const db = service();
    const fake = new File(["not an image"], "test.png", { type: "image/png" });
    expect((await handlePublicMaintenanceRequest(request({}, [fake]), db)).status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("cleans staged files after a failed upload, without publishing a partial case", async () => {
    const db = service(); db.upload.mockResolvedValue({ error: { code: "storage_error", message: "private path" } });
    expect((await handlePublicMaintenanceRequest(request({}, [png()]), db)).status).toBe(500);
    expect(db.rpc.mock.calls.some(([name]) => name === "finalize_public_maintenance_submission")).toBe(false);
    expect(db.remove).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(console.info.mock.calls)).not.toContain("private path");
    expect(JSON.stringify(console.info.mock.calls)).not.toContain(token);
  });
  it("preserves committed attachments when finalization's response was lost", async () => {
    const db = service(); const normal = db.rpc.getMockImplementation();
    db.rpc.mockImplementation(async (name, args) => name === "finalize_public_maintenance_submission" ? { error: new Error("network") } : name === "fail_public_maintenance_submission" ? { data: "completed" } : normal(name, args));
    expect((await handlePublicMaintenanceRequest(request({}, [png()]), db)).status).toBe(200);
    expect(db.remove).not.toHaveBeenCalled();
  });
  it("retains staged files when commit status cannot be determined", async () => {
    const db = service(); const normal = db.rpc.getMockImplementation();
    db.rpc.mockImplementation(async (name, args) => name === "claim_public_maintenance_submission" ? normal(name, args) : { error: new Error("network") });
    expect((await handlePublicMaintenanceRequest(request({}, [png()]), db)).status).toBe(500);
    expect(db.remove).not.toHaveBeenCalled();
  });
  it("binds retry identity to attachment bytes, not just names", async () => {
    const descriptor = (file) => [{ file, kind: "photo", extension: "png", mimeType: "image/png" }];
    const details = { description: "test" };
    expect(await hashSubmissionPayload(details, descriptor(png()))).toBe(await hashSubmissionPayload(details, descriptor(png())));
    expect(await hashSubmissionPayload(details, descriptor(png()))).not.toBe(await hashSubmissionPayload(details, descriptor(new File(["different"], "test.png", { type: "image/png" }))));
  });
  it("silently accepts the honeypot without storing anything", async () => {
    const db = service();
    expect((await handlePublicMaintenanceRequest(request({ website: "spam" }), db)).status).toBe(202);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
