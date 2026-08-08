begin;

-- A maintenance QR code identifies a unit only. It is intentionally opaque
-- public information; tenant identity and permission remain RLS concerns.
create or replace function public.generate_maintenance_qr_token()
returns text
language sql
volatile
set search_path = public
as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_'), '=');
$$;

alter table public.units
  add column if not exists maintenance_qr_token text;

-- Backfill every existing unit before making the field mandatory. Nine random
-- bytes produce a compact, URL-safe 12-character token with 72 bits of entropy.
update public.units
set maintenance_qr_token = public.generate_maintenance_qr_token()
where maintenance_qr_token is null;

alter table public.units
  alter column maintenance_qr_token set default public.generate_maintenance_qr_token(),
  alter column maintenance_qr_token set not null;

create unique index if not exists units_maintenance_qr_token_key
on public.units (maintenance_qr_token);

alter table public.units
  drop constraint if exists units_maintenance_qr_token_format_check,
  add constraint units_maintenance_qr_token_format_check
    check (maintenance_qr_token ~ '^[A-Za-z0-9_-]{8,16}$');

-- This is deliberately the only unauthenticated resolver. It exposes no IDs,
-- names, addresses, or relationship data and is used solely for a friendly
-- expired/invalid-code landing state.
create or replace function public.resolve_maintenance_qr_token(target_token text)
returns table (valid boolean)
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.units unit
    where unit.maintenance_qr_token = target_token
  );
$$;

-- An authenticated visitor gets unit information only when they are the active
-- tenant of that exact unit or can administer its property. The returned scope
-- is then used by the normal maintenance-request RLS policy as a second gate.
create or replace function public.get_my_maintenance_qr_context(target_token text)
returns table (
  workspace_id uuid,
  property_id uuid,
  unit_id uuid,
  property_name text,
  unit_name text,
  tenant_membership_id uuid,
  access_role text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    unit.workspace_id,
    unit.property_id,
    unit.id,
    property.name,
    unit.name,
    case when public.can_edit_property(unit.property_id, unit.workspace_id) then null else membership.id end,
    case when public.can_edit_property(unit.property_id, unit.workspace_id) then 'admin' else 'tenant' end
  from public.units unit
  join public.properties property on property.id = unit.property_id
  left join public.tenant_memberships membership
    on membership.unit_id = unit.id
    and membership.active
    and (
      membership.user_id = auth.uid()
      or lower(membership.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  where unit.maintenance_qr_token = target_token
    and (
      public.can_edit_property(unit.property_id, unit.workspace_id)
      or membership.id is not null
    )
  limit 1;
$$;

-- Regeneration is a deliberate property-admin action. Retrying a unique
-- collision in the database keeps the public token unique even under races.
create or replace function public.regenerate_unit_maintenance_qr(target_unit_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_property_id uuid;
  target_workspace_id uuid;
  next_token text;
  attempts integer := 0;
begin
  select unit.property_id, unit.workspace_id
  into target_property_id, target_workspace_id
  from public.units unit
  where unit.id = target_unit_id;

  if target_property_id is null
    or not public.can_edit_property(target_property_id, target_workspace_id) then
    raise exception 'You cannot regenerate this maintenance QR code.' using errcode = '42501';
  end if;

  loop
    attempts := attempts + 1;
    if attempts > 8 then
      raise exception 'A new maintenance QR code could not be generated.';
    end if;

    next_token := public.generate_maintenance_qr_token();
    begin
      update public.units
      set maintenance_qr_token = next_token,
          updated_at = now()
      where id = target_unit_id;
      return next_token;
    exception when unique_violation then
      -- Generate a fresh opaque token and retry.
    end;
  end loop;
end;
$$;

-- QR submission is still a normal tenant request. The existing scope/membership
-- checks below ensure a copied URL cannot be used for another tenant's unit.
alter table public.maintenance_requests
  drop constraint if exists maintenance_requests_source_type_check,
  add constraint maintenance_requests_source_type_check check (source_type in (
    'admin-text', 'admin-audio', 'admin-walkthrough', 'admin-walkthrough-split',
    'admin-test', 'admin-qr', 'tenant-text', 'tenant-audio', 'tenant-qr'
  ));

drop policy if exists "Tenants can submit scoped maintenance requests" on public.maintenance_requests;
create policy "Tenants can submit scoped maintenance requests"
on public.maintenance_requests for insert to authenticated
with check (
  source_type in ('tenant-text', 'tenant-audio', 'tenant-qr')
  and submitter_id = auth.uid()
  and tenant_membership_id is not null
  and public.is_active_tenant_membership(tenant_membership_id)
  and exists (
    select 1
    from public.tenant_memberships membership
    where membership.id = maintenance_requests.tenant_membership_id
      and membership.workspace_id = maintenance_requests.workspace_id
      and membership.property_id = maintenance_requests.property_id
      and membership.unit_id = maintenance_requests.unit_id
  )
);

revoke all on function public.generate_maintenance_qr_token() from public;
revoke all on function public.resolve_maintenance_qr_token(text) from public;
revoke all on function public.get_my_maintenance_qr_context(text) from public;
revoke all on function public.regenerate_unit_maintenance_qr(uuid) from public;
grant execute on function public.generate_maintenance_qr_token() to authenticated;
grant execute on function public.resolve_maintenance_qr_token(text) to anon, authenticated;
grant execute on function public.get_my_maintenance_qr_context(text) to authenticated;
grant execute on function public.regenerate_unit_maintenance_qr(uuid) to authenticated;

commit;
