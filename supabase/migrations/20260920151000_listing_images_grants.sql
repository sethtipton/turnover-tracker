-- Supabase default privileges can grant API roles table access automatically.
-- Keep metadata available only to authenticated admins through RLS.
revoke all on public.listing_images from anon, public;
revoke delete, truncate, references, trigger on public.listing_images from authenticated;
