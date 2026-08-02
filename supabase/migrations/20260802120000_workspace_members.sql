create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

alter table public.workspace_members enable row level security;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members member
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
    select 1
    from public.workspace_members member
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
    select 1
    from public.workspace_members member
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
    select 1
    from public.workspace_members member
    where member.workspace_id::text = split_part(object_name, '/', 1)
      and lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.can_edit_workspace(uuid) from public;
revoke all on function public.is_workspace_owner(uuid) from public;
revoke all on function public.can_access_turnover_object(text) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_edit_workspace(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.can_access_turnover_object(text) to authenticated;

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

drop policy if exists "Allowed family can read workspaces" on public.workspaces;
drop policy if exists "Allowed family can edit workspaces" on public.workspaces;
drop policy if exists "Allowed family can read units" on public.units;
drop policy if exists "Allowed family can edit units" on public.units;
drop policy if exists "Allowed family can read items" on public.items;
drop policy if exists "Allowed family can edit items" on public.items;
drop policy if exists "Allowed family can read attachments" on public.attachments;
drop policy if exists "Allowed family can edit attachments" on public.attachments;
drop policy if exists "Allowed family can read activity" on public.activity_log;
drop policy if exists "Allowed family can edit activity" on public.activity_log;
drop policy if exists "Allowed family can read storage" on storage.objects;
drop policy if exists "Allowed family can upload storage" on storage.objects;
drop policy if exists "Allowed family can delete storage" on storage.objects;

create policy "Members can read workspaces"
on public.workspaces for select to authenticated
using (public.is_workspace_member(id));

create policy "Editors can update workspaces"
on public.workspaces for update to authenticated
using (public.can_edit_workspace(id))
with check (public.can_edit_workspace(id));

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

drop function if exists public.is_turnover_allowed();
