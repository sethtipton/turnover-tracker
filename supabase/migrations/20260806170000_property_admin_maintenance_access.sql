begin;

-- Property admins need workspace metadata to reach the scoped maintenance
-- console, but this does not grant them access to other properties. The
-- existing property/unit/request RLS policies continue to restrict every
-- subsequent query to the properties they administer.
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
