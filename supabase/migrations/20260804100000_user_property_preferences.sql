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
