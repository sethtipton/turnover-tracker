import { supabase } from "./supabase";

export const MAINTENANCE_QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,16}$/;

export function isMaintenanceQrToken(token) {
  return typeof token === "string" && MAINTENANCE_QR_TOKEN_PATTERN.test(token);
}

export function getMaintenanceQrUrl(token, publicAppUrl) {
  if (!isMaintenanceQrToken(token)) throw new Error("Invalid maintenance QR token.");

  const fallbackUrl = typeof window === "undefined"
    ? "http://localhost/"
    : `${window.location.origin}${import.meta.env.BASE_URL}`;
  const configuredUrl = publicAppUrl || import.meta.env.VITE_PUBLIC_APP_URL || fallbackUrl;
  const baseUrl = new URL(configuredUrl);
  const normalizedBase = baseUrl.pathname.endsWith("/") ? baseUrl.pathname : `${baseUrl.pathname}/`;
  baseUrl.pathname = normalizedBase;
  baseUrl.search = "";
  baseUrl.hash = "";

  return new URL(`m/${encodeURIComponent(token)}/`, baseUrl).toString();
}

export async function resolvePublicMaintenanceQr(token) {
  if (!isMaintenanceQrToken(token)) return false;
  const { data, error } = await supabase.rpc("resolve_maintenance_qr_token", { target_token: token });
  if (error) throw error;
  return Boolean(data?.[0]?.valid);
}

export async function getMyMaintenanceQrContext(token) {
  if (!isMaintenanceQrToken(token)) return null;
  const { data, error } = await supabase.rpc("get_my_maintenance_qr_context", { target_token: token });
  if (error) throw error;
  return data?.[0] || null;
}

export async function regenerateUnitMaintenanceQr(unitId) {
  const { data, error } = await supabase.rpc("regenerate_unit_maintenance_qr", { target_unit_id: unitId });
  if (error) throw error;
  if (!isMaintenanceQrToken(data)) throw new Error("The new maintenance QR code was invalid.");
  return data;
}
