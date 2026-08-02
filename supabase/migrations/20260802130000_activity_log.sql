alter table public.activity_log
  add column if not exists actor_email text,
  add column if not exists details jsonb not null default '{}'::jsonb;

create index if not exists activity_log_unit_created_idx
on public.activity_log (unit_id, created_at desc);

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
  activity_unit_id uuid;
  activity_label text;
begin
  if tg_op = 'UPDATE'
    and new.title is not distinct from old.title
    and new.note is not distinct from old.note
    and new.status is not distinct from old.status
    and new.material_type is not distinct from old.material_type
    and new.sort_order is not distinct from old.sort_order then
    return new;
  end if;

  if tg_op = 'INSERT' then
    activity_action := 'created';
    activity_item_id := new.id;
    activity_workspace_id := new.workspace_id;
    activity_unit_id := new.unit_id;
    activity_label := new.title;
  elsif tg_op = 'DELETE' then
    activity_action := 'deleted';
    activity_item_id := old.id;
    activity_workspace_id := old.workspace_id;
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
    activity_unit_id := new.unit_id;
    activity_label := new.title;
  end if;

  insert into public.activity_log (
    workspace_id,
    unit_id,
    item_id,
    action,
    label,
    actor_email,
    details
  ) values (
    activity_workspace_id,
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
    workspace_id,
    unit_id,
    item_id,
    action,
    label,
    actor_email,
    details
  ) values (
    attachment_record.workspace_id,
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

do $$
begin
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
