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
