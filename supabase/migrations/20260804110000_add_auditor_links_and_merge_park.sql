begin;

alter table public.properties
  add column if not exists auditor_parcel_number text,
  add column if not exists auditor_parcel_url text;

-- 322 Park is a scope on the 310 Park parcel. Move its unit-scoped records
-- before removing the duplicate parent property.
alter table public.items disable trigger items_activity_log_trigger;

do $$
declare
  workspace_uuid uuid;
  target_property_uuid uuid;
  source_property_uuid uuid;
  source_unit_uuid uuid;
  target_unit_count integer;
begin
  select id into workspace_uuid
  from public.workspaces
  where name = 'Tipton Rentals';

  select id into target_property_uuid
  from public.properties
  where workspace_id = workspace_uuid and name = '310 Park';

  select id into source_property_uuid
  from public.properties
  where workspace_id = workspace_uuid and name = '322 Park';

  if target_property_uuid is not null and source_property_uuid is not null then
    if exists (select 1 from public.attachments where property_id = source_property_uuid) then
      raise exception '322 Park has attachments and must be migrated with Storage objects before it can be merged.';
    end if;

    select id into source_unit_uuid
    from public.units
    where property_id = source_property_uuid
    order by sort_order, created_at
    limit 1;

    select count(*) into target_unit_count
    from public.units
    where property_id = target_property_uuid;

    update public.items
    set property_id = target_property_uuid,
        unit_id = coalesce(unit_id, source_unit_uuid)
    where property_id = source_property_uuid;

    update public.attachments
    set property_id = target_property_uuid,
        unit_id = coalesce(unit_id, source_unit_uuid)
    where property_id = source_property_uuid;

    update public.activity_log
    set property_id = target_property_uuid,
        unit_id = coalesce(unit_id, source_unit_uuid)
    where property_id = source_property_uuid;

    update public.units
    set property_id = target_property_uuid,
        sort_order = target_unit_count + sort_order,
        updated_at = now()
    where property_id = source_property_uuid;

    insert into public.property_members (workspace_id, property_id, email, role)
    select workspace_id, target_property_uuid, email, role
    from public.property_members
    where property_id = source_property_uuid
    on conflict (property_id, email) do update set role = excluded.role;

    delete from public.property_members where property_id = source_property_uuid;

    insert into public.user_property_preferences (user_id, workspace_id, property_id, is_visible_on_home, updated_at)
    select user_id, workspace_id, target_property_uuid, is_visible_on_home, updated_at
    from public.user_property_preferences
    where property_id = source_property_uuid
    on conflict (user_id, property_id) do nothing;

    delete from public.user_property_preferences where property_id = source_property_uuid;
    delete from public.properties where id = source_property_uuid;
  end if;
end;
$$;

alter table public.items enable trigger items_activity_log_trigger;

update public.properties property
set name = '133 S Pearl',
    street_address = '133 S Pearl St.',
    updated_at = now()
from public.workspaces workspace
where property.workspace_id = workspace.id
  and workspace.name = 'Tipton Rentals'
  and property.name = '127 S Pearl';

update public.properties property
set sort_order = seed.sort_order,
    auditor_parcel_number = seed.parcel_number,
    auditor_parcel_url = format(
      'https://beacon.schneidercorp.com/Application.aspx?AppID=1147&LayerID=30592&PageTypeID=4&PageID=12392&KeyValue=%s',
      seed.parcel_number
    ),
    updated_at = now()
from public.workspaces workspace,
(values
  ('451 Park', 1, '17-025-10-00-101-000'),
  ('441 Park', 2, '17-025-10-00-103-000'),
  ('1065/1067 Hudson', 3, '17-043-00-00-030-000'),
  ('4 Vine Ct', 4, '17-013-10-00-072-000'),
  ('124/126 N Mantua', 5, '17-025-10-00-149-000'),
  ('469 Carthage', 6, '17-030-10-00-010-000'),
  ('458 W Main', 7, '17-025-20-00-069-000'),
  ('133 S Pearl', 8, '17-025-20-00-074-000'),
  ('310 Park', 9, '17-025-10-00-163-000')
) as seed(name, sort_order, parcel_number)
where property.workspace_id = workspace.id
  and workspace.name = 'Tipton Rentals'
  and seed.name = property.name;

commit;
