import { describe, expect, it } from "vitest";
import { getMaintenanceQrUrl, isMaintenanceQrToken } from "../src/lib/maintenanceQr";

describe("maintenance QR URLs", () => {
  it("accepts compact opaque URL-safe tokens only", () => {
    expect(isMaintenanceQrToken("7K4XQ9JNab_-")).toBe(true);
    expect(isMaintenanceQrToken("short")).toBe(false);
    expect(isMaintenanceQrToken("not/a/token")).toBe(false);
    expect(isMaintenanceQrToken("a".repeat(17))).toBe(false);
  });

  it("builds a stable QR link from the configured public app URL", () => {
    expect(getMaintenanceQrUrl("7K4XQ9JNab_-", "https://example.com/turnover-tracker/")).toBe(
      "https://example.com/turnover-tracker/m/7K4XQ9JNab_-/",
    );
  });
});
