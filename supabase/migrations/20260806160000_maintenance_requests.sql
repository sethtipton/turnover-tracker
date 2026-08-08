begin;

-- Phase 4 keeps tenant identity separate from workspace and property membership.
-- A tenant is scoped to a single rental unit and can only see requests tied to
-- that exact membership, never operational property data.
create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, email)
);

create index tenant_memberships_identity_idx
on public.tenant_memberships (user_id, lower(email))
where active;

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  tenant_membership_id uuid references public.tenant_memberships(id) on delete set null,
  parent_request_id uuid references public.maintenance_requests(id) on delete set null,
  source_type text not null check (source_type in (
    'admin-text', 'admin-audio', 'admin-walkthrough', 'admin-walkthrough-split',
    'admin-test', 'tenant-text', 'tenant-audio'
  )),
  source_key text,
  submitter_id uuid references auth.users(id) on delete set null,
  submitter_email text,
  title text not null,
  original_description text not null default '',
  status text not null default 'submitted' check (status in (
    'submitted', 'under-review', 'work-created', 'in-progress', 'resolved'
  )),
  tenant_status text not null default 'received' check (tenant_status in (
    'received', 'work-planned', 'in-progress', 'resolved'
  )),
  source_revision integer not null default 0,
  processing_status text not null default 'pending' check (processing_status in (
    'pending', 'processing', 'completed', 'failed'
  )),
  processing_error text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_requests_require_unit check (
    tenant_membership_id is null or unit_id is not null
  )
);

create unique index maintenance_requests_parent_source_key_idx
on public.maintenance_requests (parent_request_id, source_key)
where parent_request_id is not null and source_key is not null;

create index maintenance_requests_scope_status_idx
on public.maintenance_requests (property_id, unit_id, status, updated_at desc);

create table public.maintenance_request_entries (
  id uuid primary key default gen_random_uuid(),
  maintenance_request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  author_type text not null check (author_type in ('tenant', 'admin', 'system')),
  author_id uuid references auth.users(id) on delete set null,
  author_email text,
  entry_type text not null check (entry_type in ('description', 'note', 'audio', 'photo')),
  visibility text not null default 'tenant' check (visibility in ('tenant', 'admin')),
  content text not null default '',
  transcript text,
  created_at timestamptz not null default now()
);

create index maintenance_request_entries_request_created_idx
on public.maintenance_request_entries (maintenance_request_id, created_at, id);

create table public.maintenance_attachments (
  id uuid primary key default gen_random_uuid(),
  maintenance_request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  entry_id uuid references public.maintenance_request_entries(id) on delete set null,
  visibility text not null default 'tenant' check (visibility in ('tenant', 'admin')),
  kind text not null default 'file' check (kind in ('file', 'photo', 'audio')),
  file_name text not null,
  mime_type text not null,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index maintenance_attachments_request_created_idx
on public.maintenance_attachments (maintenance_request_id, created_at);

create table public.maintenance_analyses (
  id uuid primary key default gen_random_uuid(),
  maintenance_request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  sequence_number integer not null,
  analysis_kind text not null default 'request' check (analysis_kind in ('request', 'intake')),
  source_revision integer not null,
  source_hash text not null,
  processing_status text not null default 'processing' check (processing_status in ('processing', 'completed', 'failed')),
  model text,
  prompt_version text not null,
  schema_version text not null,
  structured_output jsonb,
  input_snapshot jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (maintenance_request_id, sequence_number),
  unique (maintenance_request_id, analysis_kind, source_revision)
);

create index maintenance_analyses_request_created_idx
on public.maintenance_analyses (maintenance_request_id, created_at desc);

create table public.maintenance_request_events (
  id uuid primary key default gen_random_uuid(),
  maintenance_request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  action text not null,
  label text not null,
  actor_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index maintenance_request_events_request_created_idx
on public.maintenance_request_events (maintenance_request_id, created_at desc);

alter table public.items
  add column if not exists maintenance_request_id uuid references public.maintenance_requests(id) on delete set null,
  add column if not exists maintenance_analysis_id uuid references public.maintenance_analyses(id) on delete set null,
  add column if not exists generation_key text;

create index items_maintenance_request_idx
on public.items (maintenance_request_id, status, created_at)
where maintenance_request_id is not null;

create unique index items_maintenance_analysis_generation_key_idx
on public.items (maintenance_analysis_id, generation_key)
where maintenance_analysis_id is not null and generation_key is not null;

alter table public.tenant_memberships enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.maintenance_request_entries enable row level security;
alter table public.maintenance_attachments enable row level security;
alter table public.maintenance_analyses enable row level security;
alter table public.maintenance_request_events enable row level security;

create or replace function public.is_active_tenant_membership(target_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships membership
    where membership.id = target_membership_id
      and membership.active
      and (
        membership.user_id = auth.uid()
        or lower(membership.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

create or replace function public.can_manage_maintenance_request(target_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.maintenance_requests request
    where request.id = target_request_id
      and public.can_edit_property(request.property_id, request.workspace_id)
  );
$$;

create or replace function public.can_view_tenant_request(target_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.maintenance_requests request
    where request.id = target_request_id
      and request.tenant_membership_id is not null
      and public.is_active_tenant_membership(request.tenant_membership_id)
  );
$$;

create or replace function public.can_access_maintenance_request(target_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_maintenance_request(target_request_id)
    or public.can_view_tenant_request(target_request_id);
$$;

create or replace function public.can_upload_maintenance_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.maintenance_request_entries entry
    join public.maintenance_requests request on request.id = entry.maintenance_request_id
    where request.workspace_id::text = split_part(object_name, '/', 1)
      and request.id::text = split_part(object_name, '/', 2)
      and entry.id::text = split_part(object_name, '/', 3)
      and (
        public.can_edit_property(request.property_id, request.workspace_id)
        or (
          public.can_view_tenant_request(request.id)
          and entry.author_type = 'tenant'
          and entry.visibility = 'tenant'
        )
      )
  );
$$;

create or replace function public.can_read_maintenance_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.maintenance_attachments attachment
    join public.maintenance_requests request on request.id = attachment.maintenance_request_id
    where attachment.storage_path = object_name
      and (
        public.can_edit_property(request.property_id, request.workspace_id)
        or (
          attachment.visibility = 'tenant'
          and public.can_view_tenant_request(request.id)
        )
      )
  );
$$;

create or replace function public.get_my_tenant_units()
returns table (
  membership_id uuid,
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
  select
    membership.id,
    membership.workspace_id,
    membership.property_id,
    membership.unit_id,
    property.name,
    unit.name
  from public.tenant_memberships membership
  join public.properties property on property.id = membership.property_id
  join public.units unit on unit.id = membership.unit_id
  where membership.active
    and (
      membership.user_id = auth.uid()
      or lower(membership.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  order by property.name, unit.sort_order, unit.name;
$$;

create or replace function public.log_maintenance_event(
  target_request_id uuid,
  event_action text,
  event_label text,
  event_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.maintenance_request_events (
    maintenance_request_id, action, label, actor_email, details
  ) values (
    target_request_id,
    event_action,
    event_label,
    lower(nullif(auth.jwt() ->> 'email', '')),
    coalesce(event_details, '{}'::jsonb)
  );
end;
$$;

create or replace function public.maintenance_request_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.enforce_tenant_membership_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  scope_unit public.units;
begin
  select * into scope_unit from public.units where id = new.unit_id;
  if scope_unit.workspace_id is distinct from new.workspace_id or scope_unit.property_id is distinct from new.property_id then
    raise exception 'Tenant membership unit must belong to its workspace and property.';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_maintenance_request_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  scope_unit public.units;
  membership public.tenant_memberships;
begin
  if new.unit_id is not null then
    select * into scope_unit from public.units where id = new.unit_id;
    if scope_unit.workspace_id is distinct from new.workspace_id or scope_unit.property_id is distinct from new.property_id then
      raise exception 'Maintenance request unit must belong to its workspace and property.';
    end if;
  end if;
  if new.tenant_membership_id is not null then
    select * into membership from public.tenant_memberships where id = new.tenant_membership_id;
    if membership.workspace_id is distinct from new.workspace_id
      or membership.property_id is distinct from new.property_id
      or membership.unit_id is distinct from new.unit_id then
      raise exception 'Tenant maintenance request must match its tenant membership scope.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_maintenance_attachment_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_request_id uuid;
begin
  if new.entry_id is not null then
    select maintenance_request_id into parent_request_id
    from public.maintenance_request_entries
    where id = new.entry_id;
    if parent_request_id is distinct from new.maintenance_request_id then
      raise exception 'Maintenance attachment entry must belong to the same request.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_maintenance_item_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_workspace_id uuid;
  request_property_id uuid;
  request_unit_id uuid;
begin
  if new.maintenance_request_id is not null then
    select workspace_id, property_id, unit_id into request_workspace_id, request_property_id, request_unit_id
    from public.maintenance_requests
    where id = new.maintenance_request_id;
    if request_workspace_id is distinct from new.workspace_id
      or request_property_id is distinct from new.property_id
      or request_unit_id is distinct from new.unit_id then
      raise exception 'Maintenance work item must match its request scope.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.log_maintenance_request_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_maintenance_event(
      new.id,
      'request-submitted',
      new.title,
      jsonb_build_object('source_type', new.source_type)
    );
  elsif new.status is distinct from old.status then
    perform public.log_maintenance_event(
      new.id,
      'request-status-changed',
      new.title,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;

create or replace function public.log_maintenance_entry_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  revision_delta boolean;
begin
  revision_delta := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    revision_delta := new.transcript is distinct from old.transcript;
  end if;

  if revision_delta then
    update public.maintenance_requests
    set source_revision = source_revision + 1,
        processing_status = 'pending',
        processing_error = null
    where id = new.maintenance_request_id;
  end if;

  perform public.log_maintenance_event(
    new.maintenance_request_id,
    case
      when new.entry_type = 'audio' and new.transcript is not null and tg_op = 'UPDATE' then 'audio-transcribed'
      else 'information-added'
    end,
    case new.entry_type
      when 'audio' then 'Voice recording'
      when 'photo' then 'Photo'
      when 'description' then 'Request description'
      else 'Additional information'
    end,
    jsonb_build_object('entry_type', new.entry_type, 'author_type', new.author_type)
  );
  return new;
end;
$$;

create or replace function public.log_maintenance_attachment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_maintenance_event(
    new.maintenance_request_id,
    case when new.kind = 'audio' then 'voice-added' else 'attachment-added' end,
    new.file_name,
    jsonb_build_object('kind', new.kind, 'visibility', new.visibility)
  );
  return new;
end;
$$;

create or replace function public.prevent_completed_analysis_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.processing_status = 'completed' then
    raise exception 'Completed maintenance analyses are immutable.';
  end if;
  return new;
end;
$$;

create or replace function public.sync_maintenance_request_from_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request_id uuid;
  approved_count integer;
  remaining_count integer;
  completed_count integer;
  next_status text;
  next_tenant_status text;
begin
  if tg_op = 'DELETE' then
    target_request_id := old.maintenance_request_id;
  else
    target_request_id := new.maintenance_request_id;
  end if;
  if target_request_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.log_maintenance_event(
      target_request_id,
      case
        when new.status = 'approved' then 'work-item-approved'
        when new.status = 'done' then 'work-item-completed'
        else 'work-item-status-changed'
      end,
      new.title,
      jsonb_build_object('from', old.status, 'to', new.status, 'item_id', new.id)
    );
  elsif tg_op = 'DELETE' and old.status = 'pending-review' then
    perform public.log_maintenance_event(
      target_request_id,
      'work-item-rejected',
      old.title,
      jsonb_build_object('item_id', old.id)
    );
  end if;

  select
    count(*) filter (where status in ('approved', 'done')),
    count(*) filter (where status = 'approved'),
    count(*) filter (where status = 'done')
  into approved_count, remaining_count, completed_count
  from public.items
  where maintenance_request_id = target_request_id;

  if approved_count = 0 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if remaining_count = 0 then
    next_status := 'resolved';
    next_tenant_status := 'resolved';
  elsif completed_count > 0 then
    next_status := 'in-progress';
    next_tenant_status := 'in-progress';
  else
    next_status := 'work-created';
    next_tenant_status := 'work-planned';
  end if;

  update public.maintenance_requests
  set status = next_status,
      tenant_status = next_tenant_status,
      resolved_at = case when next_status = 'resolved' then coalesce(resolved_at, now()) else null end
  where id = target_request_id
    and (status is distinct from next_status or tenant_status is distinct from next_tenant_status);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger maintenance_request_before_update_trigger
before update on public.maintenance_requests
for each row execute function public.maintenance_request_before_update();

create trigger tenant_membership_scope_integrity_trigger
before insert or update of workspace_id, property_id, unit_id on public.tenant_memberships
for each row execute function public.enforce_tenant_membership_scope();

create trigger maintenance_request_scope_integrity_trigger
before insert or update of workspace_id, property_id, unit_id, tenant_membership_id on public.maintenance_requests
for each row execute function public.enforce_maintenance_request_scope();

create trigger maintenance_attachment_scope_integrity_trigger
before insert or update of maintenance_request_id, entry_id on public.maintenance_attachments
for each row execute function public.enforce_maintenance_attachment_scope();

create trigger maintenance_item_scope_integrity_trigger
before insert or update of workspace_id, property_id, unit_id, maintenance_request_id on public.items
for each row execute function public.enforce_maintenance_item_scope();

create trigger maintenance_request_activity_trigger
after insert or update on public.maintenance_requests
for each row execute function public.log_maintenance_request_activity();

create trigger maintenance_entry_activity_trigger
after insert or update of transcript on public.maintenance_request_entries
for each row execute function public.log_maintenance_entry_activity();

create trigger maintenance_attachment_activity_trigger
after insert on public.maintenance_attachments
for each row execute function public.log_maintenance_attachment_activity();

create trigger maintenance_analysis_immutable_trigger
before update on public.maintenance_analyses
for each row execute function public.prevent_completed_analysis_updates();

create trigger items_maintenance_request_status_trigger
after insert or update of status, maintenance_request_id or delete on public.items
for each row execute function public.sync_maintenance_request_from_items();

create policy "Tenants can read their memberships"
on public.tenant_memberships for select to authenticated
using (
  public.is_active_tenant_membership(id)
  or public.can_edit_property(property_id, workspace_id)
);

create policy "Property admins can manage tenant memberships"
on public.tenant_memberships for all to authenticated
using (public.can_edit_property(property_id, workspace_id))
with check (public.can_edit_property(property_id, workspace_id));

create policy "Tenant and admins can read maintenance requests"
on public.maintenance_requests for select to authenticated
using (public.can_access_maintenance_request(id));

create policy "Tenants can submit scoped maintenance requests"
on public.maintenance_requests for insert to authenticated
with check (
  source_type in ('tenant-text', 'tenant-audio')
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

create policy "Property admins can manage maintenance requests"
on public.maintenance_requests for all to authenticated
using (public.can_edit_property(property_id, workspace_id))
with check (public.can_edit_property(property_id, workspace_id));

create policy "Tenant and admins can read safe request entries"
on public.maintenance_request_entries for select to authenticated
using (
  public.can_manage_maintenance_request(maintenance_request_id)
  or (
    visibility = 'tenant'
    and public.can_view_tenant_request(maintenance_request_id)
  )
);

create policy "Tenants can append to their own request history"
on public.maintenance_request_entries for insert to authenticated
with check (
  author_type = 'tenant'
  and author_id = auth.uid()
  and visibility = 'tenant'
  and public.can_view_tenant_request(maintenance_request_id)
);

create policy "Property admins can append request history"
on public.maintenance_request_entries for insert to authenticated
with check (public.can_manage_maintenance_request(maintenance_request_id));

create policy "Tenant and admins can read safe request attachments"
on public.maintenance_attachments for select to authenticated
using (
  public.can_manage_maintenance_request(maintenance_request_id)
  or (
    visibility = 'tenant'
    and public.can_view_tenant_request(maintenance_request_id)
  )
);

create policy "Tenants can add attachments to their own entries"
on public.maintenance_attachments for insert to authenticated
with check (
  visibility = 'tenant'
  and public.can_view_tenant_request(maintenance_request_id)
  and exists (
    select 1
    from public.maintenance_request_entries entry
    where entry.id = maintenance_attachments.entry_id
      and entry.maintenance_request_id = maintenance_attachments.maintenance_request_id
      and entry.author_type = 'tenant'
  )
);

create policy "Property admins can manage request attachments"
on public.maintenance_attachments for all to authenticated
using (public.can_manage_maintenance_request(maintenance_request_id))
with check (public.can_manage_maintenance_request(maintenance_request_id));

create policy "Property admins can read immutable maintenance analyses"
on public.maintenance_analyses for select to authenticated
using (public.can_manage_maintenance_request(maintenance_request_id));

create policy "Property admins can read maintenance request events"
on public.maintenance_request_events for select to authenticated
using (public.can_manage_maintenance_request(maintenance_request_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'maintenance-attachments',
  'maintenance-attachments',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'application/octet-stream']
)
on conflict (id) do nothing;

create policy "Maintenance participants can read their storage"
on storage.objects for select to authenticated
using (
  bucket_id = 'maintenance-attachments'
  and public.can_read_maintenance_object(name)
);

create policy "Maintenance participants can upload their storage"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'maintenance-attachments'
  and public.can_upload_maintenance_object(name)
);

create policy "Property admins can delete maintenance storage"
on storage.objects for delete to authenticated
using (
  bucket_id = 'maintenance-attachments'
  and exists (
    select 1
    from public.maintenance_requests request
    where request.workspace_id::text = split_part(name, '/', 1)
      and request.id::text = split_part(name, '/', 2)
      and public.can_edit_property(request.property_id, request.workspace_id)
  )
);

revoke all on function public.is_active_tenant_membership(uuid) from public;
revoke all on function public.can_manage_maintenance_request(uuid) from public;
revoke all on function public.can_view_tenant_request(uuid) from public;
revoke all on function public.can_access_maintenance_request(uuid) from public;
revoke all on function public.can_upload_maintenance_object(text) from public;
revoke all on function public.can_read_maintenance_object(text) from public;
revoke all on function public.get_my_tenant_units() from public;
revoke all on function public.log_maintenance_event(uuid, text, text, jsonb) from public;
grant execute on function public.is_active_tenant_membership(uuid) to authenticated;
grant execute on function public.can_manage_maintenance_request(uuid) to authenticated;
grant execute on function public.can_view_tenant_request(uuid) to authenticated;
grant execute on function public.can_access_maintenance_request(uuid) to authenticated;
grant execute on function public.can_upload_maintenance_object(text) to authenticated;
grant execute on function public.can_read_maintenance_object(text) to authenticated;
grant execute on function public.get_my_tenant_units() to authenticated;

commit;
