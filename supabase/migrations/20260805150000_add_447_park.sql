begin;

with workspace as (
  select id
  from public.workspaces
  where name = 'Tipton Rentals'
), inserted_property as (
  insert into public.properties (
    workspace_id,
    name,
    sort_order,
    public_name,
    property_type,
    street_address,
    city,
    state,
    postal_code,
    neighborhood,
    auditor_parcel_url
  )
  select
    workspace.id,
    '447 Park',
    3,
    '447 Park Ave',
    'Single-family home',
    '447 Park Ave',
    'Kent',
    'OH',
    '44240',
    'West River Historic Neighborhood',
    'https://beacon.schneidercorp.com/Application.aspx?AppID=1147&LayerID=30592&PageTypeID=4&PageID=12392&KeyValue=17-025-10-00-102-000'
  from workspace
  on conflict (workspace_id, name) do update
  set
    sort_order = excluded.sort_order,
    public_name = excluded.public_name,
    property_type = excluded.property_type,
    street_address = excluded.street_address,
    city = excluded.city,
    state = excluded.state,
    postal_code = excluded.postal_code,
    neighborhood = excluded.neighborhood,
    auditor_parcel_url = excluded.auditor_parcel_url,
    updated_at = now()
  returning id, workspace_id
)
insert into public.units (
  workspace_id,
  property_id,
  name,
  sort_order,
  listing_published,
  listing_status,
  listing_headline,
  address_visibility,
  bedrooms,
  full_bathrooms,
  half_bathrooms,
  listing_description
)
select
  property.workspace_id,
  property.id,
  'Main Unit',
  1,
  false,
  'coming-soon',
  'Three-bedroom home in Kent',
  'full',
  3,
  1,
  1,
  'A three-bedroom single-family home in Kent, Ohio. Additional listing details will be added as the home is prepared.'
from inserted_property property
on conflict (property_id, name) do update
set
  sort_order = excluded.sort_order,
  listing_published = excluded.listing_published,
  listing_status = excluded.listing_status,
  listing_headline = excluded.listing_headline,
  address_visibility = excluded.address_visibility,
  bedrooms = excluded.bedrooms,
  full_bathrooms = excluded.full_bathrooms,
  half_bathrooms = excluded.half_bathrooms,
  listing_description = excluded.listing_description,
  updated_at = now();

insert into public.property_members (workspace_id, property_id, email, role)
select property.workspace_id, property.id, member.email, 'admin'
from public.properties property
join public.workspaces workspace on workspace.id = property.workspace_id
cross join (values
  ('sethtipton@gmail.com'),
  ('jillianrtipton@gmail.com')
) as member(email)
where workspace.name = 'Tipton Rentals'
  and property.name = '447 Park'
on conflict (property_id, email) do update set role = excluded.role;

commit;
