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
  ('1065/1067 Hudson', 3),
  ('4 Vine Ct', 4),
  ('124/126 N Mantua', 5),
  ('469 Carthage', 6),
  ('458 W Main', 7),
  ('133 S Pearl', 8),
  ('310 Park', 9)
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
  ('1065/1067 Hudson', '1065', 1),
  ('1065/1067 Hudson', '1067', 2),
  ('4 Vine Ct', 'Main Unit', 1),
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
