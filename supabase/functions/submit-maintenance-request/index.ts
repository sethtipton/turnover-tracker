import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { handlePublicMaintenanceRequest } from "../_shared/public-maintenance-intake.ts";

export default {
  async fetch(request: Request) {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return handlePublicMaintenanceRequest(request, service);
  },
};
