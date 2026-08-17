import { supabase } from "./supabase";

export const MAINTENANCE_QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

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
  baseUrl.pathname = baseUrl.pathname.endsWith("/") ? baseUrl.pathname : `${baseUrl.pathname}/`;
  baseUrl.search = "";
  baseUrl.hash = "";

  return new URL(`maintenance/q/${encodeURIComponent(token)}/`, baseUrl).toString();
}

export async function generateUnitMaintenanceQr(unitId) {
  const { data, error } = await supabase.rpc("generate_unit_maintenance_access", { target_unit_id: unitId });
  if (error) throw error;
  if (!isMaintenanceQrToken(data)) throw new Error("The new maintenance QR code was invalid.");
  return data;
}

export async function disableUnitMaintenanceQr(unitId) {
  const { error } = await supabase.rpc("disable_unit_maintenance_access", { target_unit_id: unitId });
  if (error) throw error;
}
