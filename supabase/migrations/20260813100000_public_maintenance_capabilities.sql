begin;

-- A QR code is a bearer capability, not tenant identity. Retire the previous
-- short plaintext token column rather than preserving its lower-entropy values.
-- Existing printed cards intentionally stop working until an admin issues a new
-- capability for the unit.
drop function if exists public.resolve_maintenance_qr_token(text);
drop function if exists public.get_my_maintenance_qr_context(text);
drop function if exists public.regenerate_unit_maintenance_qr(uuid);
drop function if exists public.generate_maintenance_qr_token();

drop index if exists public.units_maintenance_qr_token_key;
alter table public.units drop constraint if exists units_maintenance_qr_token_format_check;
alter table public.units drop column if exists maintenance_qr_token;

alter table public.units
  add column if not exists maintenance_access_token_hash text,
  add column if not exists maintenance_access_enabled boolean not null default false,
  add column if not exists maintenance_access_created_at timestamptz,
  add column if not exists maintenance_access_rotated_at timestamptz,
  add column if not exists maintenance_access_last_submitted_at timestamptz;

alter table public.units
  drop constraint if exists units_maintenance_access_token_hash_format_check,
  add constraint units_maintenance_access_token_hash_format_check
    check (maintenance_access_token_hash is null or maintenance_access_token_hash ~ '^[a-f0-9]{64}$');

create unique index if not exists units_maintenance_access_token_hash_key
on public.units (maintenance_access_token_hash)
where maintenance_access_token_hash is not null;

alter table public.maintenance_requests
  add column if not exists reporter_name text,
  add column if not exists reporter_email text,
  add column if not exists reporter_phone text;

alter table public.maintenance_requests
  drop constraint if exists maintenance_requests_public_contact_lengths_check,
  add constraint maintenance_requests_public_contact_lengths_check check (
    coalesce(char_length(reporter_name), 0) <= 120
    and coalesce(char_length(reporter_email), 0) <= 254
    and coalesce(char_length(reporter_phone), 0) <= 50
  );

alter table public.maintenance_requests
  drop constraint if exists maintenance_requests_source_type_check,
  add constraint maintenance_requests_source_type_check check (source_type in (
    'admin-text', 'admin-audio', 'admin-walkthrough', 'admin-walkthrough-split',
    'admin-test', 'admin-qr', 'tenant-text', 'tenant-audio', 'tenant-qr', 'qr-public'
  ));

-- This function is the only database path that returns a plaintext capability.
-- It requires normal authenticated property-admin authorization and returns the
-- new value once so the browser can render/print it; the database stores only
-- the SHA-256 digest.
create or replace function public.generate_unit_maintenance_access(target_unit_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_property_id uuid;
  target_workspace_id uuid;
  next_token text;
  next_hash text;
  already_issued boolean;
  attempts integer := 0;
begin
  select unit.property_id, unit.workspace_id, unit.maintenance_access_token_hash is not null
  into target_property_id, target_workspace_id, already_issued
  from public.units unit
  where unit.id = target_unit_id;

  if target_property_id is null
    or not public.can_edit_property(target_property_id, target_workspace_id) then
    raise exception 'You cannot manage this unit maintenance QR code.' using errcode = '42501';
  end if;

  loop
    attempts := attempts + 1;
    if attempts > 8 then
      raise exception 'A new maintenance QR code could not be generated.';
    end if;

    next_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
    next_hash := encode(extensions.digest(next_token, 'sha256'), 'hex');
    begin
      update public.units
      set maintenance_access_token_hash = next_hash,
          maintenance_access_enabled = true,
          maintenance_access_created_at = now(),
          maintenance_access_rotated_at = case when already_issued then now() else null end,
          maintenance_access_last_submitted_at = null,
          updated_at = now()
      where id = target_unit_id;
      return next_token;
    exception when unique_violation then
      -- The unique digest index is the final collision guard. Try again.
    end;
  end loop;
end;
$$;

create or replace function public.disable_unit_maintenance_access(target_unit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_property_id uuid;
  target_workspace_id uuid;
begin
  select unit.property_id, unit.workspace_id
  into target_property_id, target_workspace_id
  from public.units unit
  where unit.id = target_unit_id;

  if target_property_id is null
    or not public.can_edit_property(target_property_id, target_workspace_id) then
    raise exception 'You cannot manage this unit maintenance QR code.' using errcode = '42501';
  end if;

  update public.units
  set maintenance_access_enabled = false,
      updated_at = now()
  where id = target_unit_id;
end;
$$;

-- These two RPCs are server-only: the Edge Function has already hashed and
-- format-checked the presented bearer token before it calls either one.
create or replace function public.resolve_public_maintenance_capability(target_token_hash text)
returns table (
  workspace_id uuid,
  property_id uuid,
  unit_id uuid,
  property_name text,
  unit_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select unit.workspace_id, unit.property_id, unit.id, property.name, unit.name
  from public.units unit
  join public.properties property on property.id = unit.property_id
  where unit.maintenance_access_token_hash = target_token_hash
    and unit.maintenance_access_enabled
  limit 1;
$$;

-- Atomically validates the capability and applies a short per-unit duplicate
-- submission window. A caller cannot supply any scope identifiers here.
create or replace function public.claim_public_maintenance_submission(target_token_hash text)
returns table (
  workspace_id uuid,
  property_id uuid,
  unit_id uuid,
  property_name text,
  unit_name text
)
language sql
volatile
security definer
set search_path = public
as $$
  with claimed as (
    update public.units unit
    set maintenance_access_last_submitted_at = now()
    where unit.maintenance_access_token_hash = target_token_hash
      and unit.maintenance_access_enabled
      and (
        unit.maintenance_access_last_submitted_at is null
        or unit.maintenance_access_last_submitted_at < now() - interval '30 seconds'
      )
    returning unit.workspace_id, unit.property_id, unit.id
  )
  select claimed.workspace_id, claimed.property_id, claimed.id, property.name, unit.name
  from claimed
  join public.units unit on unit.id = claimed.id
  join public.properties property on property.id = claimed.property_id;
$$;

revoke all on function public.generate_unit_maintenance_access(uuid) from public, anon;
revoke all on function public.disable_unit_maintenance_access(uuid) from public, anon;
revoke all on function public.resolve_public_maintenance_capability(text) from public, anon, authenticated;
revoke all on function public.claim_public_maintenance_submission(text) from public, anon, authenticated;
grant execute on function public.generate_unit_maintenance_access(uuid) to authenticated;
grant execute on function public.disable_unit_maintenance_access(uuid) to authenticated;
grant execute on function public.resolve_public_maintenance_capability(text) to service_role;
grant execute on function public.claim_public_maintenance_submission(text) to service_role;

-- Keep the bucket private. Public QR submitters upload only through the Edge
-- Function, which creates an unguessable object path after capability validation.
update storage.buckets
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic',
      'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac'
    ]
where id = 'maintenance-attachments';

commit;
