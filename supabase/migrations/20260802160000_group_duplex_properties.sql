begin;

-- Moving records between scopes is data maintenance, not user work activity.
alter table public.items disable trigger items_activity_log_trigger;

update public.properties property
set name = '451 Park', updated_at = now()
from public.workspaces workspace
where property.workspace_id = workspace.id
  and workspace.name = 'Tipton Rentals'
  and property.name = '451';

update public.properties property
set name = '441 Park', updated_at = now()
from public.workspaces workspace
where property.workspace_id = workspace.id
  and workspace.name = 'Tipton Rentals'
  and property.name = '441';

do $$
declare
  workspace_uuid uuid;
  target_property_uuid uuid;
  source_property_uuid uuid;
  target_unit_uuid uuid;
  source_unit_uuid uuid;
begin
  select id into workspace_uuid
  from public.workspaces
  where name = 'Tipton Rentals';

  select id into target_property_uuid
  from public.properties
  where workspace_id = workspace_uuid and name = '1065 Hudson Rd';

  select id into source_property_uuid
  from public.properties
  where workspace_id = workspace_uuid and name = '1067 Hudson Rd';

  if target_property_uuid is not null and source_property_uuid is not null then
    select id into target_unit_uuid
    from public.units
    where property_id = target_property_uuid
    order by sort_order, created_at
    limit 1;

    select id into source_unit_uuid
    from public.units
    where property_id = source_property_uuid
    order by sort_order, created_at
    limit 1;

    update public.items
    set unit_id = target_unit_uuid
    where property_id = target_property_uuid and unit_id is null;

    update public.attachments
    set unit_id = target_unit_uuid
    where property_id = target_property_uuid and unit_id is null;

    update public.activity_log
    set unit_id = target_unit_uuid
    where property_id = target_property_uuid and unit_id is null;

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
    set name = '1065', sort_order = 1, updated_at = now()
    where id = target_unit_uuid;

    update public.units
    set property_id = target_property_uuid,
        name = '1067',
        sort_order = 2,
        updated_at = now()
    where id = source_unit_uuid;

    update public.properties
    set name = '1065/1067 Hudson', sort_order = 3, updated_at = now()
    where id = target_property_uuid;

    delete from public.properties where id = source_property_uuid;
  end if;
end;
$$;

do $$
declare
  workspace_uuid uuid;
  target_property_uuid uuid;
  source_property_uuid uuid;
  unit_124_uuid uuid;
  unit_126_uuid uuid;
begin
  select id into workspace_uuid
  from public.workspaces
  where name = 'Tipton Rentals';

  select id into target_property_uuid
  from public.properties
  where workspace_id = workspace_uuid and name = '124 N Mantua';

  select id into source_property_uuid
  from public.properties
  where workspace_id = workspace_uuid and name = '126 N Mantua';

  if target_property_uuid is not null and source_property_uuid is not null then
    select id into unit_124_uuid
    from public.units
    where property_id = target_property_uuid
    order by sort_order, created_at
    limit 1;

    select id into unit_126_uuid
    from public.units
    where property_id = source_property_uuid
    order by sort_order, created_at
    limit 1;

    update public.items
    set unit_id = unit_124_uuid
    where property_id = target_property_uuid and unit_id is null;

    update public.attachments
    set unit_id = unit_124_uuid
    where property_id = target_property_uuid and unit_id is null;

    update public.activity_log
    set unit_id = unit_124_uuid
    where property_id = target_property_uuid and unit_id is null;

    update public.items
    set property_id = target_property_uuid,
        unit_id = coalesce(unit_id, unit_126_uuid)
    where property_id = source_property_uuid;

    update public.attachments
    set property_id = target_property_uuid,
        unit_id = coalesce(unit_id, unit_126_uuid)
    where property_id = source_property_uuid;

    update public.activity_log
    set property_id = target_property_uuid,
        unit_id = coalesce(unit_id, unit_126_uuid)
    where property_id = source_property_uuid;

    update public.units
    set name = '124', sort_order = 1, updated_at = now()
    where id = unit_124_uuid;

    update public.units
    set property_id = target_property_uuid,
        name = '126',
        sort_order = 2,
        updated_at = now()
    where id = unit_126_uuid;

    update public.properties
    set name = '124/126 N Mantua', sort_order = 5, updated_at = now()
    where id = target_property_uuid;

    delete from public.properties where id = source_property_uuid;
  end if;
end;
$$;

update public.properties property
set sort_order = seed.sort_order, updated_at = now()
from public.workspaces workspace
join (values
  ('451 Park', 1),
  ('441 Park', 2),
  ('1065/1067 Hudson', 3),
  ('4 Vine Ct', 4),
  ('124/126 N Mantua', 5),
  ('469 Carthage', 6),
  ('458 W Main', 7),
  ('127 S Pearl', 8),
  ('322 Park', 9),
  ('310 Park', 10)
) as seed(name, sort_order) on true
where property.workspace_id = workspace.id
  and workspace.name = 'Tipton Rentals'
  and property.name = seed.name;

alter table public.items enable trigger items_activity_log_trigger;

commit;
