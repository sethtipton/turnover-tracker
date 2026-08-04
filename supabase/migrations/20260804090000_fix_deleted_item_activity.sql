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
