import { describe, expect, it } from "vitest";
import { getMaintenanceQrUrl, isMaintenanceQrToken } from "../src/lib/maintenanceQr";
import {
  MAINTENANCE_CAPABILITY_TOKEN_LENGTH,
  generateMaintenanceCapabilityToken,
  hashMaintenanceCapabilityToken,
  isMaintenanceCapabilityToken,
} from "../supabase/functions/_shared/maintenance-capability.ts";

describe("maintenance QR capabilities", () => {
  it("generates 256-bit, URL-safe bearer capabilities", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateMaintenanceCapabilityToken()));

    expect(tokens).toHaveLength(100);
    for (const token of tokens) {
      expect(token).toHaveLength(MAINTENANCE_CAPABILITY_TOKEN_LENGTH);
      expect(isMaintenanceCapabilityToken(token)).toBe(true);
      expect(isMaintenanceQrToken(token)).toBe(true);
    }
  });

  it("hashes a capability deterministically without retaining a plaintext representation", async () => {
    const token = generateMaintenanceCapabilityToken();
    const hash = await hashMaintenanceCapabilityToken(token);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashMaintenanceCapabilityToken(token)).toBe(hash);
    expect(await hashMaintenanceCapabilityToken(generateMaintenanceCapabilityToken())).not.toBe(hash);
    expect(hash).not.toContain(token);
  });

  it("rejects malformed and legacy-short token values", () => {
    expect(isMaintenanceQrToken("7K4XQ9JNab_-")).toBe(false);
    expect(isMaintenanceQrToken("a".repeat(42))).toBe(false);
    expect(isMaintenanceQrToken("not/a/token")).toBe(false);
    expect(isMaintenanceQrToken("a".repeat(44))).toBe(false);
  });

  it("builds a stable public capability URL", () => {
    const token = "a".repeat(MAINTENANCE_CAPABILITY_TOKEN_LENGTH);
    expect(getMaintenanceQrUrl(token, "https://example.com/turnover-tracker/")).toBe(
      `https://example.com/turnover-tracker/maintenance/q/${token}/`,
    );
  });
});
