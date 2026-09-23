import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { handleListingInquiryEmailDelivery } from '../_shared/listing-inquiry-email.ts';
Deno.serve(request => handleListingInquiryEmailDelivery(request, createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), {enabled:Deno.env.get('LISTING_INQUIRIES_ENABLED'),jobSecret:Deno.env.get('MAINTENANCE_EMAIL_JOB_SECRET'),apiKey:Deno.env.get('RESEND_API_KEY'),from:Deno.env.get('MAINTENANCE_EMAIL_FROM'),appUrl:Deno.env.get('PUBLIC_APP_URL')}));
