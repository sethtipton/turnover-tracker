begin;

update public.units unit
set
  name = case lower(unit.name)
    when 'upstairs' then 'UP'
    when 'downstairs' then 'DOWN'
  end,
  updated_at = now()
from public.workspaces workspace
where unit.workspace_id = workspace.id
  and workspace.name = 'Tipton Rentals'
  and lower(unit.name) in ('upstairs', 'downstairs');

insert into public.properties (workspace_id, name, sort_order)
select workspace.id, seed.name, seed.sort_order
from public.workspaces workspace
cross join (values
  ('451', 1),
  ('441', 2),
  ('1065 Hudson Rd', 3),
  ('1067 Hudson Rd', 4),
  ('4 Vine Ct', 5),
  ('126 N Mantua', 6),
  ('124 N Mantua', 7),
  ('469 Carthage', 8),
  ('458 W Main', 9),
  ('127 S Pearl', 10),
  ('322 Park', 11),
  ('310 Park', 12)
) as seed(name, sort_order)
where workspace.name = 'Tipton Rentals'
on conflict (workspace_id, name) do update
set sort_order = excluded.sort_order;

insert into public.units (workspace_id, property_id, name, sort_order)
select workspace.id, property.id, seed.unit_name, seed.sort_order
from public.workspaces workspace
join public.properties property on property.workspace_id = workspace.id
join (values
  ('469 Carthage', 'Main Unit', 1),
  ('458 W Main', 'UP', 1),
  ('458 W Main', 'DOWN', 2),
  ('127 S Pearl', 'UP', 1),
  ('127 S Pearl', 'DOWN', 2),
  ('322 Park', 'AirBnB', 1),
  ('310 Park', 'Brewery', 1)
) as seed(property_name, unit_name, sort_order) on seed.property_name = property.name
where workspace.name = 'Tipton Rentals'
on conflict (property_id, name) do update
set sort_order = excluded.sort_order;

commit;
