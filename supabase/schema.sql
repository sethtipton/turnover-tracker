create extension if not exists pgcrypto;

create or replace function public.is_turnover_allowed()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = any (array[
    'jillianrtipton@gmail.com',
    'morgantipton@gmail.com',
    'ben.tipton@gmail.com',
    'bgatipton@gmail.com',
    'ryantipton@gmail.com',
    'sethtipton@gmail.com',
    'threeoakllc@gmail.com'
  ]);
$$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  title text not null,
  note text not null default '',
  category text not null default 'Prep',
  kind text not null default 'task' check (kind in ('task', 'material', 'dictation')),
  material_type text check (material_type in ('shopping', 'collect')),
  status text not null default 'approved' check (status in ('pending-review', 'approved', 'done')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
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
  unit_id uuid not null references public.units(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  action text not null,
  label text not null,
  created_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;
alter table public.units enable row level security;
alter table public.items enable row level security;
alter table public.attachments enable row level security;
alter table public.activity_log enable row level security;

create policy "Allowed family can read workspaces"
on public.workspaces for select to authenticated
using (public.is_turnover_allowed());

create policy "Allowed family can edit workspaces"
on public.workspaces for all to authenticated
using (public.is_turnover_allowed())
with check (public.is_turnover_allowed());

create policy "Allowed family can read units"
on public.units for select to authenticated
using (public.is_turnover_allowed());

create policy "Allowed family can edit units"
on public.units for all to authenticated
using (public.is_turnover_allowed())
with check (public.is_turnover_allowed());

create policy "Allowed family can read items"
on public.items for select to authenticated
using (public.is_turnover_allowed());

create policy "Allowed family can edit items"
on public.items for all to authenticated
using (public.is_turnover_allowed())
with check (public.is_turnover_allowed());

create policy "Allowed family can read attachments"
on public.attachments for select to authenticated
using (public.is_turnover_allowed());

create policy "Allowed family can edit attachments"
on public.attachments for all to authenticated
using (public.is_turnover_allowed())
with check (public.is_turnover_allowed());

create policy "Allowed family can read activity"
on public.activity_log for select to authenticated
using (public.is_turnover_allowed());

create policy "Allowed family can edit activity"
on public.activity_log for all to authenticated
using (public.is_turnover_allowed())
with check (public.is_turnover_allowed());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'turnover-attachments',
  'turnover-attachments',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'application/octet-stream']
)
on conflict (id) do nothing;

create policy "Allowed family can read storage"
on storage.objects for select to authenticated
using (bucket_id = 'turnover-attachments' and public.is_turnover_allowed());

create policy "Allowed family can upload storage"
on storage.objects for insert to authenticated
with check (bucket_id = 'turnover-attachments' and public.is_turnover_allowed());

create policy "Allowed family can delete storage"
on storage.objects for delete to authenticated
using (bucket_id = 'turnover-attachments' and public.is_turnover_allowed());

with workspace as (
  insert into public.workspaces (name)
  values ('Tipton Rentals')
  on conflict (name) do update set name = excluded.name
  returning id
)
insert into public.units (workspace_id, name, sort_order)
select workspace.id, unit_name, sort_order
from workspace,
(values
  ('451 Upstairs', 1),
  ('451 Downstairs', 2),
  ('441 Upstairs', 3),
  ('441 Downstairs', 4),
  ('1065 Hudson Rd', 5),
  ('1067 Hudson Rd', 6),
  ('4 Vine Ct', 7),
  ('126 N Mantua', 8),
  ('124 N Mantua', 9)
) as seed_units(unit_name, sort_order)
on conflict do nothing;
