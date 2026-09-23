import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { handleListingInquiry } from '../_shared/listing-inquiry.ts';
Deno.serve(request => handleListingInquiry(request, createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), {enabled:Deno.env.get('LISTING_INQUIRIES_ENABLED'),rateSecret:Deno.env.get('LISTING_INQUIRY_RATE_SECRET')}));
