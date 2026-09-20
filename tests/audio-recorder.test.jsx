// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useAudioRecorder } from "../src/hooks/useAudioRecorder";

it("stays busy through microphone permission and final audio data delivery", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let api, recorder, grantPermission;
  const stream = { getTracks: () => [{ stop: vi.fn() }] };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(() => new Promise((resolve) => { grantPermission = resolve; })) } });
  class FakeRecorder {
    static isTypeSupported() { return true; }
    constructor() { recorder = this; this.stream = stream; this.mimeType = "audio/webm"; }
    start() { this.state = "recording"; }
    requestData() {}
    stop() { this.state = "inactive"; }
  }
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  URL.createObjectURL = vi.fn(() => "blob:test"); URL.revokeObjectURL = vi.fn();
  function Harness() { api = useAudioRecorder({ enabled: true, onMessage: vi.fn() }); return null; }
  const container = document.createElement("div"); const root = createRoot(container);
  await act(async () => root.render(<Harness />));
  let started;
  await act(async () => { started = api.start(); });
  expect(api.state).toBe("requesting");
  await act(async () => { grantPermission(stream); await started; });
  expect(api.state).toBe("recording");
  await act(async () => api.stop());
  expect(api.state).toBe("finalizing"); expect(api.recordings).toHaveLength(0);
  await act(async () => {
    recorder.ondataavailable({ data: new Blob([new Uint8Array(1024)]) });
    recorder.onstop();
  });
  expect(api.state).toBe("idle"); expect(api.recordings[0].file.size).toBe(1024);
  await act(async () => root.unmount()); vi.unstubAllGlobals();
});
