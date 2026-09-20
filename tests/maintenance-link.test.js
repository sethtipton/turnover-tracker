// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { getMaintenanceRequestLinkFromCurrentPath } from "../src/lib/routing";
const requestId = "11111111-1111-4111-8111-111111111111";
const propertyId = "22222222-2222-4222-8222-222222222222";
const base = import.meta.env.BASE_URL;
afterEach(() => window.history.replaceState({}, "", base));
it("reads the request and property from an admin email link", () => {
  window.history.replaceState({}, "", `${base}maintenance/?property=${propertyId}&request=${requestId}`);
  expect(getMaintenanceRequestLinkFromCurrentPath()).toEqual({ requestId, propertyId });
});
it("ignores malformed identifiers and public intake links", () => {
  for (const path of [`maintenance/?request=bad`, `maintenance/q/token/?request=${requestId}`, `maintenance/?preview=1&request=${requestId}`]) {
    window.history.replaceState({}, "", base + path);
    expect(getMaintenanceRequestLinkFromCurrentPath()).toBeNull();
  }
});
it("keeps a valid request when the optional property is malformed", () => {
  window.history.replaceState({}, "", `${base}maintenance/?property=bad&request=${requestId}`);
  expect(getMaintenanceRequestLinkFromCurrentPath()).toEqual({ requestId, propertyId: "" });
});
