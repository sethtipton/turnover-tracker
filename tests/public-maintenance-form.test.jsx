// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MaintenanceQrRoute } from "../src/components/MaintenanceQrRoute";
import { inspectPublicMaintenanceCapability, submitPublicMaintenanceRequest } from "../src/lib/maintenance";

const recorder = vi.hoisted(() => ({ state: "idle", recordings: [], start: vi.fn(), stop: vi.fn(), removeRecording: vi.fn() }));
vi.mock("../src/hooks/useAudioRecorder", () => ({ useAudioRecorder: () => recorder }));
vi.mock("../src/lib/maintenance", () => ({ inspectPublicMaintenanceCapability: vi.fn(), submitPublicMaintenanceRequest: vi.fn() }));
let root, container;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  recorder.state = "idle";
  vi.clearAllMocks();
  inspectPublicMaintenanceCapability.mockResolvedValue({ propertyName: "Carthage", unitName: "Main Unit" });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<MaintenanceQrRoute token={"a".repeat(43)} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function fillDescription() {
  const input = container.querySelector("textarea");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, "Leaking tap");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() { await act(async () => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

it.each(["requesting", "recording", "finalizing"])("blocks submission while audio is %s", async (state) => {
  await fillDescription(); recorder.state = state;
  await act(async () => root.render(<MaintenanceQrRoute token={"a".repeat(43)} />));
  expect(container.querySelector('button[type="submit"]').disabled).toBe(true);
  await submit(); expect(submitPublicMaintenanceRequest).not.toHaveBeenCalled();
});
it("retries an uncertain response using the original ID and payload, then shows an accurate receipt", async () => {
  await fillDescription();
  submitPublicMaintenanceRequest.mockRejectedValueOnce(new Error("Connection interrupted")).mockResolvedValueOnce({ received: true });
  await submit();
  const original = submitPublicMaintenanceRequest.mock.calls[0][0];
  expect(original.description).toBe("Leaking tap"); expect(original.submissionId).toMatch(/^[a-f0-9-]{36}$/);
  expect(container.querySelector("textarea").closest("fieldset").disabled).toBe(true);
  expect(container.textContent).toContain("Retry request");
  await submit();
  expect(submitPublicMaintenanceRequest.mock.calls[1][0]).toBe(original);
  expect(container.textContent).toContain("Your request was received.");
  expect(container.textContent).not.toContain("has been notified");
});
it("lets a user edit after a pre-save validation rejection", async () => {
  await fillDescription();
  submitPublicMaintenanceRequest.mockRejectedValueOnce(Object.assign(new Error("Bad file"), { status: 400 }));
  await submit();
  expect(container.querySelector("textarea").closest("fieldset").disabled).toBe(false);
  expect(container.querySelector("textarea").value).toBe("Leaking tap");
});
