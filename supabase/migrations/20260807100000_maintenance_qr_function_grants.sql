begin;

-- Supabase projects can install direct anon/authenticated default grants on
-- newly-created functions. Revoke those direct grants, not just PUBLIC, so the
-- context and regeneration RPCs cannot be called before authentication.
revoke all on function public.generate_maintenance_qr_token() from public, anon;
revoke all on function public.get_my_maintenance_qr_context(text) from public, anon;
revoke all on function public.regenerate_unit_maintenance_qr(uuid) from public, anon;
revoke all on function public.resolve_maintenance_qr_token(text) from public;

grant execute on function public.generate_maintenance_qr_token() to authenticated;
grant execute on function public.resolve_maintenance_qr_token(text) to anon, authenticated;
grant execute on function public.get_my_maintenance_qr_context(text) to authenticated;
grant execute on function public.regenerate_unit_maintenance_qr(uuid) to authenticated;

commit;
