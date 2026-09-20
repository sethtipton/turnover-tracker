import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { handleMaintenanceEmailDelivery } from "../_shared/maintenance-email.ts";

export default {
  async fetch(request: Request) {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return handleMaintenanceEmailDelivery(request, service, {
      enabled: Deno.env.get("MAINTENANCE_EMAIL_ENABLED"),
      jobSecret: Deno.env.get("MAINTENANCE_EMAIL_JOB_SECRET"),
      apiKey: Deno.env.get("RESEND_API_KEY"),
      from: Deno.env.get("MAINTENANCE_EMAIL_FROM"),
      appUrl: Deno.env.get("PUBLIC_APP_URL"),
    });
  },
};
