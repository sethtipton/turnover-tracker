// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MaintenanceQrRoute } from "../src/components/MaintenanceQrRoute";
import { inspectPublicMaintenanceCapability, submitPublicMaintenanceRequest } from "../src/lib/maintenance";

const recorder = vi.hoisted(() => ({ state: "idle", recordings: [], start: vi.fn(), stop: vi.fn(), removeRecording: vi.fn() }));
vi.mock("../src/hooks/useAudioRecorder", () => ({ useAudioRecorder: ({ onMessage }) => { recorder.onMessage = onMessage; return recorder; } }));
vi.mock("../src/lib/maintenance", () => ({ inspectPublicMaintenanceCapability: vi.fn(), submitPublicMaintenanceRequest: vi.fn() }));
let root, container;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  recorder.state = "idle";
  recorder.recordings = [];
  vi.clearAllMocks();
  inspectPublicMaintenanceCapability.mockResolvedValue({ propertyName: "Carthage", unitName: "Main Unit" });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<MaintenanceQrRoute token={"a".repeat(43)} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });
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
  expect(container.querySelector(".maintenance-receipt").textContent).toContain("Leaking tap");
  expect(container.querySelector(".maintenance-receipt").textContent).not.toMatch(/Main Unit|Photos|Voice message|Email|Phone/);
  expect(document.activeElement).toBe(container.querySelector(".maintenance-success"));
  expect(container.textContent).not.toContain("has been notified");
});
it("lets a user edit after a pre-save validation rejection", async () => {
  await fillDescription();
  submitPublicMaintenanceRequest.mockRejectedValueOnce(Object.assign(new Error("Bad file"), { status: 400 }));
  await submit();
  expect(container.querySelector("textarea").closest("fieldset").disabled).toBe(false);
  expect(container.querySelector("textarea").value).toBe("Leaking tap");
});

it("hides the default unit label but preserves a meaningful unit name", async () => {
  expect(container.querySelector("#maintenance-qr-unit").textContent).toBe("Carthage");
  inspectPublicMaintenanceCapability.mockResolvedValue({ propertyName: "Carthage", unitName: "Unit 2" });
  await act(async () => root.render(<MaintenanceQrRoute token={"b".repeat(43)} />));
  expect(container.querySelector("#maintenance-qr-unit").textContent).toBe("Carthage · Unit 2");
});

it("shows a running timer, finishing status, then a playable recording above photos", async () => {
  vi.useFakeTimers();
  recorder.state = "recording";
  await act(async () => root.render(<MaintenanceQrRoute token={"a".repeat(43)} />));
  await act(async () => vi.advanceTimersByTime(2200));
  expect(container.querySelector(".public-recording-status").textContent).toBe("Recording· 0:02");
  const stop = [...container.querySelectorAll("button")].find(button => button.textContent.includes("Stop recording"));
  await act(async () => stop.click());
  expect(recorder.stop).toHaveBeenCalledOnce();
  recorder.state = "finalizing";
  await act(async () => root.render(<MaintenanceQrRoute token={"a".repeat(43)} />));
  expect(container.querySelector(".public-recording-status").textContent).toBe("Finishing recording…");
  expect(container.querySelector("audio")).toBeNull();
  recorder.state = "idle";
  recorder.recordings = [{ id: "voice", url: "blob:voice", durationMs: 2200, peakLevel: 0.5 }, { id: "older-voice", url: "blob:older", durationMs: 1000, peakLevel: 0.5 }];
  await act(async () => root.render(<MaintenanceQrRoute token={"a".repeat(43)} />));
  expect(container.querySelector(".public-recording-status").textContent).toBe("Voice message ready· 0:02");
  const audio = container.querySelector("audio");
  expect(audio.controls).toBe(true);
  expect(audio.getAttribute("src")).toBe("blob:voice");
  expect(audio.compareDocumentPosition(container.querySelector(".tenant-upload-button")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const remove = [...container.querySelectorAll("button")].find(button => button.textContent === "Remove");
  await act(async () => remove.click());
  expect(recorder.removeRecording).toHaveBeenCalledWith("voice");
  expect(recorder.removeRecording).toHaveBeenCalledWith("older-voice");
});

it("shows microphone errors beside the recording controls", async () => {
  await act(async () => recorder.onMessage("Microphone access was blocked."));
  expect(container.querySelector('.public-voice-message [role="alert"]').textContent).toBe("Microphone access was blocked.");
  expect(container.querySelector('button[type="submit"]').disabled).toBe(false);
});

it.each(["photo", "audio", "both"])("confirms an attachment-only %s request with the supplied contact details", async (kind) => {
  const photo = new File(["photo"], "test.png", { type: "image/png" });
  const audio = new File(["audio"], "test.m4a", { type: "audio/mp4" });
  if (kind !== "photo") {
    recorder.recordings = [{ id: "voice", url: "blob:voice", file: audio, durationMs: 5000, peakLevel: 0.5 }];
    await act(async () => root.render(<MaintenanceQrRoute token={"a".repeat(43)} />));
  }
  if (kind !== "audio") {
    const input = container.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", { value: [photo] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  }
  for (const [name, value] of [["name", "Test tenant"], ["email", "tenant@example.invalid"], ["phone", "555-0100"]]) {
    const input = container.querySelector(`input[name="${name}"]`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  submitPublicMaintenanceRequest.mockResolvedValue({ received: true });
  await submit();
  const receipt = container.querySelector(".maintenance-receipt");
  expect(receipt.textContent).toContain("Carthage");
  expect(receipt.textContent).not.toContain("Your request");
  expect(receipt.textContent).toContain("Test tenant");
  expect(receipt.textContent).toContain("tenant@example.invalid");
  expect(receipt.textContent).toContain("555-0100");
  expect(receipt.textContent.includes("1 attached")).toBe(kind !== "audio");
  expect(receipt.textContent.includes("0:05 recording attached")).toBe(kind !== "photo");
});
