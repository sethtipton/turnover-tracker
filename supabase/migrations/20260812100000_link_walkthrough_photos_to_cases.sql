begin;

create table public.maintenance_attachment_case_links (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null references public.maintenance_attachments(id) on delete cascade,
  maintenance_request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (attachment_id, maintenance_request_id)
);

create index maintenance_attachment_case_links_request_idx
on public.maintenance_attachment_case_links (maintenance_request_id, created_at);

create or replace function public.enforce_maintenance_attachment_case_link_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_request_id uuid;
  source_kind text;
  target_parent_request_id uuid;
begin
  select maintenance_request_id, kind
  into source_request_id, source_kind
  from public.maintenance_attachments
  where id = new.attachment_id;

  select parent_request_id
  into target_parent_request_id
  from public.maintenance_requests
  where id = new.maintenance_request_id;

  if source_kind is distinct from 'photo' then
    raise exception 'Only photos can be linked to generated maintenance cases.';
  end if;

  if target_parent_request_id is distinct from source_request_id then
    raise exception 'A walkthrough photo can only be linked to a direct child case from the same walkthrough.';
  end if;

  return new;
end;
$$;

create trigger maintenance_attachment_case_link_scope_integrity_trigger
before insert or update of attachment_id, maintenance_request_id
on public.maintenance_attachment_case_links
for each row execute function public.enforce_maintenance_attachment_case_link_scope();

alter table public.maintenance_attachment_case_links enable row level security;

create policy "Property admins can manage walkthrough photo links"
on public.maintenance_attachment_case_links for all to authenticated
using (public.can_manage_maintenance_request(maintenance_request_id))
with check (public.can_manage_maintenance_request(maintenance_request_id));

commit;
