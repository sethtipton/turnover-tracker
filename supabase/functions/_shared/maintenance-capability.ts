export const MAINTENANCE_CAPABILITY_TOKEN_BYTES = 32;
export const MAINTENANCE_CAPABILITY_TOKEN_LENGTH = 43;
export const MAINTENANCE_CAPABILITY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isMaintenanceCapabilityToken(value: unknown): value is string {
  return typeof value === "string" && MAINTENANCE_CAPABILITY_TOKEN_PATTERN.test(value);
}

export function generateMaintenanceCapabilityToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(MAINTENANCE_CAPABILITY_TOKEN_BYTES));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function hashMaintenanceCapabilityToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
