create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  sort_order integer not null default 0,
  auditor_parcel_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.user_property_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  is_visible_on_home boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, property_id)
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, name)
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  title text not null,
  note text not null default '',
  category text not null default 'Prep',
  kind text not null default 'task' check (kind in ('task', 'material', 'dictation')),
  material_type text check (material_type in ('shopping', 'collect')),
  constraint items_material_type_matches_kind check (
    (kind = 'material' and material_type is not null)
    or (kind <> 'material' and material_type is null)
  ),
  status text not null default 'approved' check (status in ('pending-review', 'approved', 'done')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  item_id uuid not null references public.items(id) on delete cascade,
  kind text not null default 'file' check (kind in ('file', 'photo', 'audio')),
  file_name text not null,
  mime_type text not null,
  storage_path text not null unique,
  delete_after timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  item_id uuid references public.items(id) on delete set null,
  action text not null,
  label text not null,
  actor_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists properties_workspace_order_idx
on public.properties (workspace_id, sort_order, name);

create index if not exists units_property_order_idx
on public.units (property_id, sort_order, name);

create index if not exists items_property_scope_order_idx
on public.items (property_id, unit_id, sort_order, created_at);

create index if not exists attachments_property_scope_idx
on public.attachments (property_id, unit_id, created_at);

create index if not exists activity_log_property_scope_created_idx
on public.activity_log (property_id, unit_id, created_at desc);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.properties enable row level security;
alter table public.user_property_preferences enable row level security;
alter table public.units enable row level security;
alter table public.items enable row level security;
alter table public.attachments enable row level security;
alter table public.activity_log enable row level security;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members member
    where member.workspace_id = target_workspace_id
      and lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.can_edit_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members member
    where member.workspace_id = target_workspace_id
      and lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and member.role in ('owner', 'editor')
  );
$$;

create or replace function public.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members member
    where member.workspace_id = target_workspace_id
      and lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and member.role = 'owner'
  );
$$;

create or replace function public.can_access_turnover_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members member
    where member.workspace_id::text = split_part(object_name, '/', 1)
      and lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.log_item_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  activity_action text;
  activity_item_id uuid;
  activity_workspace_id uuid;
  activity_property_id uuid;
  activity_unit_id uuid;
  activity_label text;
begin
  -- Reordering is operational metadata, not a work-history event.
  if tg_op = 'UPDATE'
    and new.sort_order is distinct from old.sort_order
    and new.title is not distinct from old.title
    and new.note is not distinct from old.note
    and new.status is not distinct from old.status
    and new.material_type is not distinct from old.material_type
    and new.property_id is not distinct from old.property_id
    and new.unit_id is not distinct from old.unit_id
    and new.archived_at is not distinct from old.archived_at then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.title is not distinct from old.title
    and new.note is not distinct from old.note
    and new.status is not distinct from old.status
    and new.material_type is not distinct from old.material_type
    and new.sort_order is not distinct from old.sort_order
    and new.property_id is not distinct from old.property_id
    and new.unit_id is not distinct from old.unit_id
    and new.archived_at is not distinct from old.archived_at then
    return new;
  end if;

  if tg_op = 'INSERT' then
    activity_action := 'created';
    activity_item_id := new.id;
    activity_workspace_id := new.workspace_id;
    activity_property_id := new.property_id;
    activity_unit_id := new.unit_id;
    activity_label := new.title;
  elsif tg_op = 'DELETE' then
    activity_action := 'deleted';
    -- The item no longer exists after an AFTER DELETE trigger runs.
    activity_item_id := null;
    activity_workspace_id := old.workspace_id;
    activity_property_id := old.property_id;
    activity_unit_id := old.unit_id;
    activity_label := old.title;
  else
    activity_action := case
      when new.status = 'done' and old.status <> 'done' then 'completed'
      when old.status = 'done' and new.status <> 'done' then 'reopened'
      when new.archived_at is not null and old.archived_at is null then 'archived'
      when new.archived_at is null and old.archived_at is not null then 'unarchived'
      when new.status <> old.status then 'status-changed'
      else 'updated'
    end;
    activity_item_id := new.id;
    activity_workspace_id := new.workspace_id;
    activity_property_id := new.property_id;
    activity_unit_id := new.unit_id;
    activity_label := new.title;
  end if;

  insert into public.activity_log (
    workspace_id, property_id, unit_id, item_id, action, label, actor_email, details
  ) values (
    activity_workspace_id,
    activity_property_id,
    activity_unit_id,
    activity_item_id,
    activity_action,
    activity_label,
    lower(nullif(auth.jwt() ->> 'email', '')),
    jsonb_build_object('source', 'item-trigger')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.log_attachment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  attachment_record public.attachments;
  item_label text;
begin
  if tg_op = 'DELETE' then
    attachment_record := old;
  else
    attachment_record := new;
  end if;

  select item.title into item_label
  from public.items item
  where item.id = attachment_record.item_id;

  insert into public.activity_log (
    workspace_id, property_id, unit_id, item_id, action, label, actor_email, details
  ) values (
    attachment_record.workspace_id,
    attachment_record.property_id,
    attachment_record.unit_id,
    attachment_record.item_id,
    case when tg_op = 'DELETE' then 'attachment-removed' else 'attachment-added' end,
    coalesce(item_label, attachment_record.file_name),
    lower(nullif(auth.jwt() ->> 'email', '')),
    jsonb_build_object(
      'source', 'attachment-trigger',
      'file_name', attachment_record.file_name,
      'kind', attachment_record.kind
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists items_activity_log_trigger on public.items;
create trigger items_activity_log_trigger
after insert or update or delete on public.items
for each row execute function public.log_item_activity();

drop trigger if exists attachments_activity_log_trigger on public.attachments;
create trigger attachments_activity_log_trigger
after insert or delete on public.attachments
for each row execute function public.log_attachment_activity();

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.can_edit_workspace(uuid) from public;
revoke all on function public.is_workspace_owner(uuid) from public;
revoke all on function public.can_access_turnover_object(text) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_edit_workspace(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.can_access_turnover_object(text) to authenticated;

create policy "Members can read workspaces"
on public.workspaces for select to authenticated
using (public.is_workspace_member(id));

create policy "Editors can update workspaces"
on public.workspaces for update to authenticated
using (public.can_edit_workspace(id))
with check (public.can_edit_workspace(id));

create policy "Members can read properties"
on public.properties for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Editors can manage properties"
on public.properties for all to authenticated
using (public.can_edit_workspace(workspace_id))
with check (public.can_edit_workspace(workspace_id));

create policy "Users can manage their property preferences"
on public.user_property_preferences for all to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and public.is_workspace_member(workspace_id)
);

create policy "Members can read units"
on public.units for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Editors can manage units"
on public.units for all to authenticated
using (public.can_edit_workspace(workspace_id))
with check (public.can_edit_workspace(workspace_id));

create policy "Members can read items"
on public.items for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Editors can manage items"
on public.items for all to authenticated
using (public.can_edit_workspace(workspace_id))
with check (public.can_edit_workspace(workspace_id));

create policy "Members can read attachments"
on public.attachments for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Editors can manage attachments"
on public.attachments for all to authenticated
using (public.can_edit_workspace(workspace_id))
with check (public.can_edit_workspace(workspace_id));

create policy "Members can read activity"
on public.activity_log for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Editors can manage activity"
on public.activity_log for all to authenticated
using (public.can_edit_workspace(workspace_id))
with check (public.can_edit_workspace(workspace_id));

create policy "Members can read memberships"
on public.workspace_members for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Owners can manage memberships"
on public.workspace_members for all to authenticated
using (public.is_workspace_owner(workspace_id))
with check (public.is_workspace_owner(workspace_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'turnover-attachments',
  'turnover-attachments',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'application/octet-stream']
)
on conflict (id) do nothing;

create policy "Members can read storage"
on storage.objects for select to authenticated
using (bucket_id = 'turnover-attachments' and public.can_access_turnover_object(name));

create policy "Editors can upload storage"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'turnover-attachments'
  and public.can_edit_workspace((split_part(name, '/', 1))::uuid)
);

create policy "Editors can delete storage"
on storage.objects for delete to authenticated
using (
  bucket_id = 'turnover-attachments'
  and public.can_edit_workspace((split_part(name, '/', 1))::uuid)
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'properties'
  ) then
    alter publication supabase_realtime add table public.properties;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'units'
  ) then
    alter publication supabase_realtime add table public.units;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items'
  ) then
    alter publication supabase_realtime add table public.items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attachments'
  ) then
    alter publication supabase_realtime add table public.attachments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_log'
  ) then
    alter publication supabase_realtime add table public.activity_log;
  end if;
end;
$$;

insert into public.workspaces (name)
values ('Tipton Rentals')
on conflict (name) do update set name = excluded.name;

insert into public.properties (workspace_id, name, sort_order)
select workspace.id, seed.name, seed.sort_order
from public.workspaces workspace
cross join (values
  ('451 Park', 1),
  ('441 Park', 2),
  ('447 Park', 3),
  ('1065/1067 Hudson', 4),
  ('4 Vine', 5),
  ('124/126 N Mantua', 6),
  ('469 Carthage', 7),
  ('458 W Main', 8),
  ('133 S Pearl', 9),
  ('310 Park', 10)
) as seed(name, sort_order)
where workspace.name = 'Tipton Rentals'
on conflict (workspace_id, name) do update set sort_order = excluded.sort_order;

insert into public.units (workspace_id, property_id, name, sort_order)
select workspace.id, property.id, seed.unit_name, seed.sort_order
from public.workspaces workspace
join public.properties property on property.workspace_id = workspace.id
join (values
  ('451 Park', 'UP', 1),
  ('451 Park', 'DOWN', 2),
  ('441 Park', 'UP', 1),
  ('441 Park', 'DOWN', 2),
  ('447 Park', 'Main Unit', 1),
  ('1065/1067 Hudson', '1065', 1),
  ('1065/1067 Hudson', '1067', 2),
  ('4 Vine', 'Main Unit', 1),
  ('124/126 N Mantua', '124', 1),
  ('124/126 N Mantua', '126', 2),
  ('469 Carthage', 'Main Unit', 1),
  ('458 W Main', 'UP', 1),
  ('458 W Main', 'DOWN', 2),
  ('133 S Pearl', 'UP', 1),
  ('133 S Pearl', 'DOWN', 2),
  ('310 Park', 'Brewery', 1),
  ('310 Park', 'AirBnB', 2)
) as seed(property_name, unit_name, sort_order) on seed.property_name = property.name
where workspace.name = 'Tipton Rentals'
on conflict (property_id, name) do update set sort_order = excluded.sort_order;

insert into public.workspace_members (workspace_id, email, role)
select workspace.id, member.email, member.role
from public.workspaces workspace
cross join (values
  ('sethtipton@gmail.com', 'owner'),
  ('jillianrtipton@gmail.com', 'editor'),
  ('morgantipton@gmail.com', 'editor'),
  ('ben.tipton@gmail.com', 'editor'),
  ('bgatipton@gmail.com', 'editor'),
  ('ryantipton@gmail.com', 'editor'),
  ('threeoakllc@gmail.com', 'editor')
) as member(email, role)
where workspace.name = 'Tipton Rentals'
on conflict (workspace_id, email) do update set role = excluded.role;

-- Canonical bootstrap alignment (Phase 2 through Phase 4).
-- Keep this section in the same order as supabase/migrations. New deployments can
-- run this schema file in the SQL Editor; existing deployments should use migrations.
create table if not exists public.property_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  email text not null,
  role text not null default 'admin' check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now(),
  unique (property_id, email)
);

create index if not exists property_members_workspace_email_idx
on public.property_members (workspace_id, lower(email));

alter table public.property_members enable row level security;

create or replace function public.is_property_member(target_property_id uuid, target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.property_members member
    where member.property_id = target_property_id
      and member.workspace_id = target_workspace_id
      and lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.can_access_property(target_property_id uuid, target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_workspace_owner(target_workspace_id)
    or public.is_property_member(target_property_id, target_workspace_id);
$$;

create or replace function public.can_edit_property(target_property_id uuid, target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_workspace_owner(target_workspace_id)
    or exists (
      select 1
      from public.property_members member
      where member.property_id = target_property_id
        and member.workspace_id = target_workspace_id
        and member.role = 'admin'
        and lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

create or replace function public.can_access_turnover_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.properties property
    where property.id::text = split_part(object_name, '/', 2)
      and property.workspace_id::text = split_part(object_name, '/', 1)
      and public.can_access_property(property.id, property.workspace_id)
  );
$$;

create or replace function public.can_edit_turnover_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.properties property
    where property.id::text = split_part(object_name, '/', 2)
      and property.workspace_id::text = split_part(object_name, '/', 1)
      and public.can_edit_property(property.id, property.workspace_id)
  );
$$;

create or replace function public.set_property_member_access(
  target_workspace_id uuid,
  target_email text,
  target_property_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_owner(target_workspace_id) then
    raise exception 'Only a workspace owner can manage property access.';
  end if;

  if not exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = target_workspace_id
      and lower(member.email) = lower(target_email)
  ) then
    raise exception 'The selected person is not a workspace member.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(target_property_ids, array[]::uuid[])) as selected_property(id)
    where not exists (
      select 1
      from public.properties property
      where property.id = selected_property.id
        and property.workspace_id = target_workspace_id
    )
  ) then
    raise exception 'One or more properties do not belong to this workspace.';
  end if;

  delete from public.property_members
  where workspace_id = target_workspace_id
    and lower(email) = lower(target_email);

  insert into public.property_members (workspace_id, property_id, email, role)
  select target_workspace_id, selected_property.id, lower(target_email), 'admin'
  from unnest(coalesce(target_property_ids, array[]::uuid[])) as selected_property(id);
end;
$$;

revoke all on function public.is_property_member(uuid, uuid) from public;
revoke all on function public.can_access_property(uuid, uuid) from public;
revoke all on function public.can_edit_property(uuid, uuid) from public;
revoke all on function public.can_access_turnover_object(text) from public;
revoke all on function public.can_edit_turnover_object(text) from public;
revoke all on function public.set_property_member_access(uuid, text, uuid[]) from public;
grant execute on function public.is_property_member(uuid, uuid) to authenticated;
grant execute on function public.can_access_property(uuid, uuid) to authenticated;
grant execute on function public.can_edit_property(uuid, uuid) to authenticated;
grant execute on function public.can_access_turnover_object(text) to authenticated;
grant execute on function public.can_edit_turnover_object(text) to authenticated;
grant execute on function public.set_property_member_access(uuid, text, uuid[]) to authenticated;

drop policy if exists "Members can read property memberships" on public.property_members;
drop policy if exists "Owners can manage property memberships" on public.property_members;
create policy "Owners can read property memberships"
on public.property_members for select to authenticated
using (public.is_workspace_owner(workspace_id));

create policy "Owners can manage property memberships"
on public.property_members for all to authenticated
using (public.is_workspace_owner(workspace_id))
with check (public.is_workspace_owner(workspace_id));

drop policy if exists "Members can read properties" on public.properties;
drop policy if exists "Editors can manage properties" on public.properties;
create policy "Property members can read properties"
on public.properties for select to authenticated
using (public.can_access_property(id, workspace_id));

create policy "Workspace owners can create properties"
on public.properties for insert to authenticated
with check (public.is_workspace_owner(workspace_id));

create policy "Property admins can update properties"
on public.properties for update to authenticated
using (public.can_edit_property(id, workspace_id))
with check (public.can_edit_property(id, workspace_id));

create policy "Property admins can delete properties"
on public.properties for delete to authenticated
using (public.can_edit_property(id, workspace_id));

drop policy if exists "Members can read units" on public.units;
drop policy if exists "Editors can manage units" on public.units;
create policy "Property members can read units"
on public.units for select to authenticated
using (public.can_access_property(property_id, workspace_id));

create policy "Property admins can manage units"
on public.units for all to authenticated
using (public.can_edit_property(property_id, workspace_id))
with check (public.can_edit_property(property_id, workspace_id));

drop policy if exists "Members can read items" on public.items;
drop policy if exists "Editors can manage items" on public.items;
create policy "Property members can read items"
on public.items for select to authenticated
using (public.can_access_property(property_id, workspace_id));

create policy "Property admins can manage items"
on public.items for all to authenticated
using (public.can_edit_property(property_id, workspace_id))
with check (public.can_edit_property(property_id, workspace_id));

drop policy if exists "Members can read attachments" on public.attachments;
drop policy if exists "Editors can manage attachments" on public.attachments;
create policy "Property members can read attachments"
on public.attachments for select to authenticated
using (public.can_access_property(property_id, workspace_id));

create policy "Property admins can manage attachments"
on public.attachments for all to authenticated
using (public.can_edit_property(property_id, workspace_id))
with check (public.can_edit_property(property_id, workspace_id));

drop policy if exists "Members can read activity" on public.activity_log;
drop policy if exists "Editors can manage activity" on public.activity_log;
create policy "Property members can read activity"
on public.activity_log for select to authenticated
using (public.can_access_property(property_id, workspace_id));

drop policy if exists "Members can read storage" on storage.objects;
drop policy if exists "Editors can upload storage" on storage.objects;
drop policy if exists "Editors can delete storage" on storage.objects;
create policy "Property members can read storage"
on storage.objects for select to authenticated
using (bucket_id = 'turnover-attachments' and public.can_access_turnover_object(name));

create policy "Property admins can upload storage"
on storage.objects for insert to authenticated
with check (bucket_id = 'turnover-attachments' and public.can_edit_turnover_object(name));

create policy "Property admins can delete storage"
on storage.objects for delete to authenticated
using (bucket_id = 'turnover-attachments' and public.can_edit_turnover_object(name));

with property_grants as (
  select property_name, email
  from (values ('451 Park'), ('441 Park')) properties(property_name)
  cross join (values ('sethtipton@gmail.com'), ('jillianrtipton@gmail.com')) members(email)
  union all
  select property_name, email
  from (values ('1065/1067 Hudson'), ('4 Vine Ct'), ('124/126 N Mantua'), ('469 Carthage')) properties(property_name)
  cross join (values
    ('sethtipton@gmail.com'),
    ('jillianrtipton@gmail.com'),
    ('morgantipton@gmail.com'),
    ('ben.tipton@gmail.com'),
    ('bgatipton@gmail.com'),
    ('ryantipton@gmail.com'),
    ('threeoakllc@gmail.com')
  ) members(email)
  union all
  select property_name, email
  from (values ('458 W Main'), ('127 S Pearl'), ('322 Park'), ('310 Park')) properties(property_name)
  cross join (values ('bgatipton@gmail.com'), ('ryantipton@gmail.com')) members(email)
)
insert into public.property_members (workspace_id, property_id, email, role)
select property.workspace_id, property.id, access_grant.email, 'admin'
from property_grants access_grant
join public.properties property on property.name = access_grant.property_name
on conflict (property_id, email) do update set role = excluded.role;
alter table public.properties
  add column if not exists public_name text,
  add column if not exists property_type text,
  add column if not exists street_address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists neighborhood text;

alter table public.units
  add column if not exists listing_published boolean not null default false,
  add column if not exists listing_status text not null default 'off-market',
  add column if not exists listing_headline text,
  add column if not exists address_visibility text not null default 'city',
  add column if not exists unit_number text,
  add column if not exists monthly_rent integer,
  add column if not exists rent_display_type text not null default 'exact',
  add column if not exists available_date date,
  add column if not exists lease_term text,
  add column if not exists bedrooms numeric(3, 1),
  add column if not exists full_bathrooms numeric(3, 1),
  add column if not exists half_bathrooms numeric(3, 1),
  add column if not exists interior_square_feet integer,
  add column if not exists listing_description text,
  add column if not exists amenities text[] not null default array[]::text[];

alter table public.units
  drop constraint if exists units_listing_status_check,
  drop constraint if exists units_address_visibility_check,
  drop constraint if exists units_rent_display_type_check,
  drop constraint if exists units_monthly_rent_check,
  drop constraint if exists units_bedrooms_check,
  drop constraint if exists units_full_bathrooms_check,
  drop constraint if exists units_half_bathrooms_check,
  drop constraint if exists units_interior_square_feet_check;

alter table public.units
  add constraint units_listing_status_check check (listing_status in ('available', 'coming-soon', 'occupied', 'off-market')),
  add constraint units_address_visibility_check check (address_visibility in ('full', 'approximate', 'city')),
  add constraint units_rent_display_type_check check (rent_display_type in ('exact', 'starting-at', 'contact')),
  add constraint units_monthly_rent_check check (monthly_rent is null or monthly_rent >= 0),
  add constraint units_bedrooms_check check (bedrooms is null or bedrooms >= 0),
  add constraint units_full_bathrooms_check check (full_bathrooms is null or full_bathrooms >= 0),
  add constraint units_half_bathrooms_check check (half_bathrooms is null or half_bathrooms >= 0),
  add constraint units_interior_square_feet_check check (interior_square_feet is null or interior_square_feet > 0);

create index if not exists units_public_listing_idx
on public.units (listing_published, listing_status, property_id, sort_order)
where listing_published and listing_status in ('available', 'coming-soon');

create or replace function public.listing_slug(value text)
returns text
language sql
immutable
strict
as $$
  select trim(both '-' from regexp_replace(
    regexp_replace(lower(replace(btrim(value), '&', 'and')), '[^a-z0-9]+', '-', 'g'),
    '-+', '-', 'g'
  ));
$$;

create or replace function public.get_public_listings()
returns table (
  property_id uuid,
  unit_id uuid,
  property_name text,
  property_slug text,
  unit_name text,
  unit_slug text,
  property_type text,
  listing_headline text,
  listing_status text,
  display_address text,
  city text,
  state text,
  neighborhood text,
  monthly_rent integer,
  rent_display_type text,
  available_date date,
  lease_term text,
  bedrooms numeric,
  full_bathrooms numeric,
  half_bathrooms numeric,
  interior_square_feet integer,
  listing_description text,
  amenities text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    property.id,
    unit.id,
    coalesce(nullif(property.public_name, ''), property.name),
    public.listing_slug(property.name),
    unit.name,
    public.listing_slug(unit.name),
    nullif(property.property_type, ''),
    coalesce(
      nullif(unit.listing_headline, ''),
      concat_ws(' ', coalesce(nullif(property.public_name, ''), property.name), nullif(unit.unit_number, ''), nullif(unit.name, 'Main Unit'))
    ),
    unit.listing_status,
    case unit.address_visibility
      when 'full' then concat_ws(', ',
        nullif(concat_ws(' ', nullif(property.street_address, ''), nullif(unit.unit_number, '')), ''),
        nullif(concat_ws(', ', nullif(property.city, ''), nullif(property.state, '')), ''),
        nullif(property.postal_code, '')
      )
      when 'approximate' then coalesce(
        nullif(property.neighborhood, ''),
        nullif(concat_ws(', ', nullif(property.city, ''), nullif(property.state, '')), '')
      )
      else nullif(concat_ws(', ', nullif(property.city, ''), nullif(property.state, '')), '')
    end,
    nullif(property.city, ''),
    nullif(property.state, ''),
    nullif(property.neighborhood, ''),
    unit.monthly_rent,
    unit.rent_display_type,
    unit.available_date,
    nullif(unit.lease_term, ''),
    unit.bedrooms,
    unit.full_bathrooms,
    unit.half_bathrooms,
    unit.interior_square_feet,
    nullif(unit.listing_description, ''),
    array_remove(unit.amenities, '')
  from public.units unit
  join public.properties property on property.id = unit.property_id
  where unit.listing_published
    and unit.listing_status in ('available', 'coming-soon')
  order by
    case unit.listing_status when 'available' then 0 else 1 end,
    unit.available_date nulls last,
    property.sort_order,
    unit.sort_order;
$$;

revoke all on function public.listing_slug(text) from public;
revoke all on function public.get_public_listings() from public;
grant execute on function public.get_public_listings() to anon, authenticated;
alter table public.items
  add column if not exists archived_at timestamptz;

create index if not exists items_property_scope_archived_idx
on public.items (property_id, unit_id, archived_at, sort_order, created_at);

create or replace function public.log_item_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  activity_action text;
  activity_item_id uuid;
  activity_workspace_id uuid;
  activity_property_id uuid;
  activity_unit_id uuid;
  activity_label text;
begin
  if tg_op = 'UPDATE'
    and new.title is not distinct from old.title
    and new.note is not distinct from old.note
    and new.status is not distinct from old.status
    and new.material_type is not distinct from old.material_type
    and new.sort_order is not distinct from old.sort_order
    and new.property_id is not distinct from old.property_id
    and new.unit_id is not distinct from old.unit_id
    and new.archived_at is not distinct from old.archived_at then
    return new;
  end if;

  if tg_op = 'INSERT' then
    activity_action := 'created';
    activity_item_id := new.id;
    activity_workspace_id := new.workspace_id;
    activity_property_id := new.property_id;
    activity_unit_id := new.unit_id;
    activity_label := new.title;
  elsif tg_op = 'DELETE' then
    activity_action := 'deleted';
    activity_item_id := old.id;
    activity_workspace_id := old.workspace_id;
    activity_property_id := old.property_id;
    activity_unit_id := old.unit_id;
    activity_label := old.title;
  else
    activity_action := case
      when new.status = 'done' and old.status <> 'done' then 'completed'
      when old.status = 'done' and new.status <> 'done' then 'reopened'
      when new.archived_at is not null and old.archived_at is null then 'archived'
      when new.archived_at is null and old.archived_at is not null then 'unarchived'
      when new.status <> old.status then 'status-changed'
      else 'updated'
    end;
    activity_item_id := new.id;
    activity_workspace_id := new.workspace_id;
    activity_property_id := new.property_id;
    activity_unit_id := new.unit_id;
    activity_label := new.title;
  end if;

  insert into public.activity_log (
    workspace_id, property_id, unit_id, item_id, action, label, actor_email, details
  ) values (
    activity_workspace_id,
    activity_property_id,
    activity_unit_id,
    activity_item_id,
    activity_action,
    activity_label,
    lower(nullif(auth.jwt() ->> 'email', '')),
    jsonb_build_object('source', 'item-trigger')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create or replace function public.log_item_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  activity_action text;
  activity_item_id uuid;
  activity_workspace_id uuid;
  activity_property_id uuid;
  activity_unit_id uuid;
  activity_label text;
begin
  if tg_op = 'UPDATE'
    and new.title is not distinct from old.title
    and new.note is not distinct from old.note
    and new.status is not distinct from old.status
    and new.material_type is not distinct from old.material_type
    and new.sort_order is not distinct from old.sort_order
    and new.property_id is not distinct from old.property_id
    and new.unit_id is not distinct from old.unit_id
    and new.archived_at is not distinct from old.archived_at then
    return new;
  end if;

  if tg_op = 'INSERT' then
    activity_action := 'created';
    activity_item_id := new.id;
    activity_workspace_id := new.workspace_id;
    activity_property_id := new.property_id;
    activity_unit_id := new.unit_id;
    activity_label := new.title;
  elsif tg_op = 'DELETE' then
    activity_action := 'deleted';
    activity_item_id := null;
    activity_workspace_id := old.workspace_id;
    activity_property_id := old.property_id;
    activity_unit_id := old.unit_id;
    activity_label := old.title;
  else
    activity_action := case
      when new.status = 'done' and old.status <> 'done' then 'completed'
      when old.status = 'done' and new.status <> 'done' then 'reopened'
      when new.archived_at is not null and old.archived_at is null then 'archived'
      when new.archived_at is null and old.archived_at is not null then 'unarchived'
      when new.status <> old.status then 'status-changed'
      else 'updated'
    end;
    activity_item_id := new.id;
    activity_workspace_id := new.workspace_id;
    activity_property_id := new.property_id;
    activity_unit_id := new.unit_id;
    activity_label := new.title;
  end if;

  insert into public.activity_log (
    workspace_id, property_id, unit_id, item_id, action, label, actor_email, details
  ) values (
    activity_workspace_id,
    activity_property_id,
    activity_unit_id,
    activity_item_id,
    activity_action,
    activity_label,
    lower(nullif(auth.jwt() ->> 'email', '')),
    jsonb_build_object('source', 'item-trigger')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create table if not exists public.user_property_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  is_visible_on_home boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, property_id)
);

alter table public.user_property_preferences enable row level security;

drop policy if exists "Users can manage their property preferences" on public.user_property_preferences;
create policy "Users can manage their property preferences"
on public.user_property_preferences for all to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and public.is_workspace_member(workspace_id)
);
begin;

alter table public.properties
  add column if not exists auditor_parcel_number text,
  add column if not exists auditor_parcel_url text;

-- 322 Park is a scope on the 310 Park parcel. Move its unit-scoped records
-- before removing the duplicate parent property.
alter table public.items disable trigger items_activity_log_trigger;

do $$
declare
  workspace_uuid uuid;
  target_property_uuid uuid;
  source_property_uuid uuid;
  source_unit_uuid uuid;
  target_unit_count integer;
begin
  select id into workspace_uuid
  from public.workspaces
  where name = 'Tipton Rentals';

  select id into target_property_uuid
  from public.properties
  where workspace_id = workspace_uuid and name = '310 Park';

  select id into source_property_uuid
  from public.properties
  where workspace_id = workspace_uuid and name = '322 Park';

  if target_property_uuid is not null and source_property_uuid is not null then
    if exists (select 1 from public.attachments where property_id = source_property_uuid) then
      raise exception '322 Park has attachments and must be migrated with Storage objects before it can be merged.';
    end if;

    select id into source_unit_uuid
    from public.units
    where property_id = source_property_uuid
    order by sort_order, created_at
    limit 1;

    select count(*) into target_unit_count
    from public.units
    where property_id = target_property_uuid;

    update public.items
    set property_id = target_property_uuid,
        unit_id = coalesce(unit_id, source_unit_uuid)
    where property_id = source_property_uuid;

    update public.attachments
    set property_id = target_property_uuid,
        unit_id = coalesce(unit_id, source_unit_uuid)
    where property_id = source_property_uuid;

    update public.activity_log
    set property_id = target_property_uuid,
        unit_id = coalesce(unit_id, source_unit_uuid)
    where property_id = source_property_uuid;

    update public.units
    set property_id = target_property_uuid,
        sort_order = target_unit_count + sort_order,
        updated_at = now()
    where property_id = source_property_uuid;

    insert into public.property_members (workspace_id, property_id, email, role)
    select workspace_id, target_property_uuid, email, role
    from public.property_members
    where property_id = source_property_uuid
    on conflict (property_id, email) do update set role = excluded.role;

    delete from public.property_members where property_id = source_property_uuid;

    insert into public.user_property_preferences (user_id, workspace_id, property_id, is_visible_on_home, updated_at)
    select user_id, workspace_id, target_property_uuid, is_visible_on_home, updated_at
    from public.user_property_preferences
    where property_id = source_property_uuid
    on conflict (user_id, property_id) do nothing;

    delete from public.user_property_preferences where property_id = source_property_uuid;
    delete from public.properties where id = source_property_uuid;
  end if;
end;
$$;

alter table public.items enable trigger items_activity_log_trigger;

update public.properties property
set name = '133 S Pearl',
    street_address = '133 S Pearl St.',
    updated_at = now()
from public.workspaces workspace
where property.workspace_id = workspace.id
  and workspace.name = 'Tipton Rentals'
  and property.name = '127 S Pearl';

update public.properties property
set sort_order = seed.sort_order,
    auditor_parcel_number = seed.parcel_number,
    auditor_parcel_url = format(
      'https://beacon.schneidercorp.com/Application.aspx?AppID=1147&LayerID=30592&PageTypeID=4&PageID=12392&KeyValue=%s',
      seed.parcel_number
    ),
    updated_at = now()
from public.workspaces workspace,
(values
  ('451 Park', 1, '17-025-10-00-101-000'),
  ('441 Park', 2, '17-025-10-00-103-000'),
  ('1065/1067 Hudson', 3, '17-043-00-00-030-000'),
  ('4 Vine Ct', 4, '17-013-10-00-072-000'),
  ('124/126 N Mantua', 5, '17-025-10-00-149-000'),
  ('469 Carthage', 6, '17-030-10-00-010-000'),
  ('458 W Main', 7, '17-025-20-00-069-000'),
  ('133 S Pearl', 8, '17-025-20-00-074-000'),
  ('310 Park', 9, '17-025-10-00-163-000')
) as seed(name, sort_order, parcel_number)
where property.workspace_id = workspace.id
  and workspace.name = 'Tipton Rentals'
  and seed.name = property.name;

commit;

alter table public.properties
  drop column if exists auditor_parcel_number;
alter table public.items
  add constraint items_material_type_matches_kind check (
    (kind = 'material' and material_type is not null)
    or (kind <> 'material' and material_type is null)
  );
update public.properties
set name = '4 Vine'
where name = '4 Vine Ct';
begin;

with workspace as (
  select id
  from public.workspaces
  where name = 'Tipton Rentals'
), inserted_property as (
  insert into public.properties (
    workspace_id,
    name,
    sort_order,
    public_name,
    property_type,
    street_address,
    city,
    state,
    postal_code,
    neighborhood,
    auditor_parcel_url
  )
  select
    workspace.id,
    '447 Park',
    3,
    '447 Park Ave',
    'Single-family home',
    '447 Park Ave',
    'Kent',
    'OH',
    '44240',
    'West River Historic Neighborhood',
    'https://beacon.schneidercorp.com/Application.aspx?AppID=1147&LayerID=30592&PageTypeID=4&PageID=12392&KeyValue=17-025-10-00-102-000'
  from workspace
  on conflict (workspace_id, name) do update
  set
    sort_order = excluded.sort_order,
    public_name = excluded.public_name,
    property_type = excluded.property_type,
    street_address = excluded.street_address,
    city = excluded.city,
    state = excluded.state,
    postal_code = excluded.postal_code,
    neighborhood = excluded.neighborhood,
    auditor_parcel_url = excluded.auditor_parcel_url,
    updated_at = now()
  returning id, workspace_id
)
insert into public.units (
  workspace_id,
  property_id,
  name,
  sort_order,
  listing_published,
  listing_status,
  listing_headline,
  address_visibility,
  bedrooms,
  full_bathrooms,
  half_bathrooms,
  listing_description
)
select
  property.workspace_id,
  property.id,
  'Main Unit',
  1,
  false,
  'coming-soon',
  'Three-bedroom home in Kent',
  'full',
  3,
  1,
  1,
  'A three-bedroom single-family home in Kent, Ohio. Additional listing details will be added as the home is prepared.'
from inserted_property property
on conflict (property_id, name) do update
set
  sort_order = excluded.sort_order,
  listing_published = excluded.listing_published,
  listing_status = excluded.listing_status,
  listing_headline = excluded.listing_headline,
  address_visibility = excluded.address_visibility,
  bedrooms = excluded.bedrooms,
  full_bathrooms = excluded.full_bathrooms,
  half_bathrooms = excluded.half_bathrooms,
  listing_description = excluded.listing_description,
  updated_at = now();

insert into public.property_members (workspace_id, property_id, email, role)
select property.workspace_id, property.id, member.email, 'admin'
from public.properties property
join public.workspaces workspace on workspace.id = property.workspace_id
cross join (values
  ('sethtipton@gmail.com'),
  ('jillianrtipton@gmail.com')
) as member(email)
where workspace.name = 'Tipton Rentals'
  and property.name = '447 Park'
on conflict (property_id, email) do update set role = excluded.role;

commit;
create or replace function public.log_item_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  activity_action text;
  activity_item_id uuid;
  activity_workspace_id uuid;
  activity_property_id uuid;
  activity_unit_id uuid;
  activity_label text;
begin
  -- Reordering is operational metadata, not a work-history event.
  if tg_op = 'UPDATE'
    and new.sort_order is distinct from old.sort_order
    and new.title is not distinct from old.title
    and new.note is not distinct from old.note
    and new.status is not distinct from old.status
    and new.material_type is not distinct from old.material_type
    and new.property_id is not distinct from old.property_id
    and new.unit_id is not distinct from old.unit_id
    and new.archived_at is not distinct from old.archived_at then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.title is not distinct from old.title
    and new.note is not distinct from old.note
    and new.status is not distinct from old.status
    and new.material_type is not distinct from old.material_type
    and new.sort_order is not distinct from old.sort_order
    and new.property_id is not distinct from old.property_id
    and new.unit_id is not distinct from old.unit_id
    and new.archived_at is not distinct from old.archived_at then
    return new;
  end if;

  if tg_op = 'INSERT' then
    activity_action := 'created';
    activity_item_id := new.id;
    activity_workspace_id := new.workspace_id;
    activity_property_id := new.property_id;
    activity_unit_id := new.unit_id;
    activity_label := new.title;
  elsif tg_op = 'DELETE' then
    activity_action := 'deleted';
    activity_item_id := null;
    activity_workspace_id := old.workspace_id;
    activity_property_id := old.property_id;
    activity_unit_id := old.unit_id;
    activity_label := old.title;
  else
    activity_action := case
      when new.status = 'done' and old.status <> 'done' then 'completed'
      when old.status = 'done' and new.status <> 'done' then 'reopened'
      when new.archived_at is not null and old.archived_at is null then 'archived'
      when new.archived_at is null and old.archived_at is not null then 'unarchived'
      when new.status <> old.status then 'status-changed'
      else 'updated'
    end;
    activity_item_id := new.id;
    activity_workspace_id := new.workspace_id;
    activity_property_id := new.property_id;
    activity_unit_id := new.unit_id;
    activity_label := new.title;
  end if;

  insert into public.activity_log (
    workspace_id, property_id, unit_id, item_id, action, label, actor_email, details
  ) values (
    activity_workspace_id,
    activity_property_id,
    activity_unit_id,
    activity_item_id,
    activity_action,
    activity_label,
    lower(nullif(auth.jwt() ->> 'email', '')),
    jsonb_build_object('source', 'item-trigger')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
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

begin;

-- Property-level admins can reach the maintenance workspace without becoming
-- workspace members. Property, request, and item RLS remain their scope gate.
create or replace function public.is_property_admin_for_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.property_members membership
    where membership.workspace_id = target_workspace_id
      and membership.role = 'admin'
      and lower(membership.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_property_admin_for_workspace(uuid) from public;
grant execute on function public.is_property_admin_for_workspace(uuid) to authenticated;

drop policy if exists "Members can read workspaces" on public.workspaces;
drop policy if exists "Workspace and property admins can read workspaces" on public.workspaces;
create policy "Workspace and property admins can read workspaces"
on public.workspaces for select to authenticated
using (
  public.is_workspace_member(id)
  or public.is_property_admin_for_workspace(id)
);

commit;

-- Maintenance QR bootstrap alignment. The versioned migration is the source of
-- truth for existing projects; this keeps a new schema install equivalent.
begin;

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

create or replace function public.resolve_maintenance_qr_token(target_token text)
returns table (valid boolean)
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.units unit where unit.maintenance_qr_token = target_token
  );
$$;

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
    end;
  end loop;
end;
$$;

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
revoke all on function public.generate_maintenance_qr_token() from anon;
revoke all on function public.get_my_maintenance_qr_context(text) from anon;
revoke all on function public.regenerate_unit_maintenance_qr(uuid) from anon;
grant execute on function public.generate_maintenance_qr_token() to authenticated;
grant execute on function public.resolve_maintenance_qr_token(text) to anon, authenticated;
grant execute on function public.get_my_maintenance_qr_context(text) to authenticated;
grant execute on function public.regenerate_unit_maintenance_qr(uuid) to authenticated;

commit;
