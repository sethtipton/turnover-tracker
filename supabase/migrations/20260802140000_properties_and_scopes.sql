begin;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

alter table public.properties enable row level security;

alter table public.units add column if not exists property_id uuid;
alter table public.items add column if not exists property_id uuid;
alter table public.attachments add column if not exists property_id uuid;
alter table public.activity_log add column if not exists property_id uuid;

insert into public.properties (workspace_id, name, sort_order)
select
  unit.workspace_id,
  regexp_replace(unit.name, '\s+(Upstairs|Downstairs)$', '', 'i') as property_name,
  min(unit.sort_order)
from public.units unit
group by unit.workspace_id, regexp_replace(unit.name, '\s+(Upstairs|Downstairs)$', '', 'i')
on conflict (workspace_id, name) do update
set sort_order = least(public.properties.sort_order, excluded.sort_order);

-- Unit names only need to be unique inside their parent property after this migration.
alter table public.units drop constraint if exists units_workspace_id_name_key;

update public.units unit
set
  property_id = property.id,
  name = case
    when unit.name ~* '\s+Upstairs$' then 'Upstairs'
    when unit.name ~* '\s+Downstairs$' then 'Downstairs'
    else 'Main Unit'
  end,
  updated_at = now()
from public.properties property
where property.workspace_id = unit.workspace_id
  and property.name = regexp_replace(unit.name, '\s+(Upstairs|Downstairs)$', '', 'i')
  and unit.property_id is null;

with ranked_units as (
  select
    id,
    row_number() over (partition by property_id order by sort_order, created_at, id) as next_order
  from public.units
)
update public.units unit
set sort_order = ranked.next_order
from ranked_units ranked
where unit.id = ranked.id;

update public.items item
set property_id = unit.property_id
from public.units unit
where item.unit_id = unit.id
  and item.property_id is null;

update public.attachments attachment
set property_id = item.property_id
from public.items item
where attachment.item_id = item.id
  and attachment.property_id is null;

update public.activity_log activity
set property_id = item.property_id
from public.items item
where activity.item_id = item.id
  and activity.property_id is null;

update public.activity_log activity
set property_id = unit.property_id
from public.units unit
where activity.unit_id = unit.id
  and activity.property_id is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'units_property_id_fkey') then
    alter table public.units
      add constraint units_property_id_fkey
      foreign key (property_id) references public.properties(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'items_property_id_fkey') then
    alter table public.items
      add constraint items_property_id_fkey
      foreign key (property_id) references public.properties(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'attachments_property_id_fkey') then
    alter table public.attachments
      add constraint attachments_property_id_fkey
      foreign key (property_id) references public.properties(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'activity_log_property_id_fkey') then
    alter table public.activity_log
      add constraint activity_log_property_id_fkey
      foreign key (property_id) references public.properties(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'units_property_name_key') then
    alter table public.units
      add constraint units_property_name_key unique (property_id, name);
  end if;
end;
$$;

alter table public.units alter column property_id set not null;
alter table public.items alter column property_id set not null;
alter table public.items alter column unit_id drop not null;
alter table public.attachments alter column property_id set not null;
alter table public.attachments alter column unit_id drop not null;
alter table public.activity_log alter column property_id set not null;
alter table public.activity_log alter column unit_id drop not null;

alter table public.items drop constraint if exists items_unit_id_fkey;
alter table public.items
  add constraint items_unit_id_fkey
  foreign key (unit_id) references public.units(id) on delete set null;

alter table public.attachments drop constraint if exists attachments_unit_id_fkey;
alter table public.attachments
  add constraint attachments_unit_id_fkey
  foreign key (unit_id) references public.units(id) on delete set null;

alter table public.activity_log drop constraint if exists activity_log_unit_id_fkey;
alter table public.activity_log
  add constraint activity_log_unit_id_fkey
  foreign key (unit_id) references public.units(id) on delete set null;

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
    and new.unit_id is not distinct from old.unit_id then
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
    workspace_id,
    property_id,
    unit_id,
    item_id,
    action,
    label,
    actor_email,
    details
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

  if tg_op = 'DELETE' then return old; end if;
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
    workspace_id,
    property_id,
    unit_id,
    item_id,
    action,
    label,
    actor_email,
    details
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

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop policy if exists "Members can read properties" on public.properties;
drop policy if exists "Editors can manage properties" on public.properties;

create policy "Members can read properties"
on public.properties for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Editors can manage properties"
on public.properties for all to authenticated
using (public.can_edit_workspace(workspace_id))
with check (public.can_edit_workspace(workspace_id));

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
end;
$$;

commit;
