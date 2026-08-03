alter table public.properties
  add column if not exists public_name text,
  add column if not exists property_type text,
  add column if not exists street_address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists neighborhood text;

alter table public.units
  add column if not exists listing_published boolean not null default false,
  add column if not exists listing_status text not null default 'off-market',
  add column if not exists listing_headline text,
  add column if not exists address_visibility text not null default 'city',
  add column if not exists unit_number text,
  add column if not exists monthly_rent integer,
  add column if not exists rent_display_type text not null default 'exact',
  add column if not exists available_date date,
  add column if not exists lease_term text,
  add column if not exists bedrooms numeric(3, 1),
  add column if not exists full_bathrooms numeric(3, 1),
  add column if not exists half_bathrooms numeric(3, 1),
  add column if not exists interior_square_feet integer,
  add column if not exists listing_description text,
  add column if not exists amenities text[] not null default array[]::text[];

alter table public.units
  drop constraint if exists units_listing_status_check,
  drop constraint if exists units_address_visibility_check,
  drop constraint if exists units_rent_display_type_check,
  drop constraint if exists units_monthly_rent_check,
  drop constraint if exists units_bedrooms_check,
  drop constraint if exists units_full_bathrooms_check,
  drop constraint if exists units_half_bathrooms_check,
  drop constraint if exists units_interior_square_feet_check;

alter table public.units
  add constraint units_listing_status_check check (listing_status in ('available', 'coming-soon', 'occupied', 'off-market')),
  add constraint units_address_visibility_check check (address_visibility in ('full', 'approximate', 'city')),
  add constraint units_rent_display_type_check check (rent_display_type in ('exact', 'starting-at', 'contact')),
  add constraint units_monthly_rent_check check (monthly_rent is null or monthly_rent >= 0),
  add constraint units_bedrooms_check check (bedrooms is null or bedrooms >= 0),
  add constraint units_full_bathrooms_check check (full_bathrooms is null or full_bathrooms >= 0),
  add constraint units_half_bathrooms_check check (half_bathrooms is null or half_bathrooms >= 0),
  add constraint units_interior_square_feet_check check (interior_square_feet is null or interior_square_feet > 0);

create index if not exists units_public_listing_idx
on public.units (listing_published, listing_status, property_id, sort_order)
where listing_published and listing_status in ('available', 'coming-soon');

create or replace function public.listing_slug(value text)
returns text
language sql
immutable
strict
as $$
  select trim(both '-' from regexp_replace(
    regexp_replace(lower(replace(btrim(value), '&', 'and')), '[^a-z0-9]+', '-', 'g'),
    '-+', '-', 'g'
  ));
$$;

create or replace function public.get_public_listings()
returns table (
  property_id uuid,
  unit_id uuid,
  property_name text,
  property_slug text,
  unit_name text,
  unit_slug text,
  property_type text,
  listing_headline text,
  listing_status text,
  display_address text,
  city text,
  state text,
  neighborhood text,
  monthly_rent integer,
  rent_display_type text,
  available_date date,
  lease_term text,
  bedrooms numeric,
  full_bathrooms numeric,
  half_bathrooms numeric,
  interior_square_feet integer,
  listing_description text,
  amenities text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    property.id,
    unit.id,
    coalesce(nullif(property.public_name, ''), property.name),
    public.listing_slug(property.name),
    unit.name,
    public.listing_slug(unit.name),
    nullif(property.property_type, ''),
    coalesce(
      nullif(unit.listing_headline, ''),
      concat_ws(' ', coalesce(nullif(property.public_name, ''), property.name), nullif(unit.unit_number, ''), nullif(unit.name, 'Main Unit'))
    ),
    unit.listing_status,
    case unit.address_visibility
      when 'full' then concat_ws(', ',
        nullif(concat_ws(' ', nullif(property.street_address, ''), nullif(unit.unit_number, '')), ''),
        nullif(concat_ws(', ', nullif(property.city, ''), nullif(property.state, '')), ''),
        nullif(property.postal_code, '')
      )
      when 'approximate' then coalesce(
        nullif(property.neighborhood, ''),
        nullif(concat_ws(', ', nullif(property.city, ''), nullif(property.state, '')), '')
      )
      else nullif(concat_ws(', ', nullif(property.city, ''), nullif(property.state, '')), '')
    end,
    nullif(property.city, ''),
    nullif(property.state, ''),
    nullif(property.neighborhood, ''),
    unit.monthly_rent,
    unit.rent_display_type,
    unit.available_date,
    nullif(unit.lease_term, ''),
    unit.bedrooms,
    unit.full_bathrooms,
    unit.half_bathrooms,
    unit.interior_square_feet,
    nullif(unit.listing_description, ''),
    array_remove(unit.amenities, '')
  from public.units unit
  join public.properties property on property.id = unit.property_id
  where unit.listing_published
    and unit.listing_status in ('available', 'coming-soon')
  order by
    case unit.listing_status when 'available' then 0 else 1 end,
    unit.available_date nulls last,
    property.sort_order,
    unit.sort_order;
$$;

revoke all on function public.listing_slug(text) from public;
revoke all on function public.get_public_listings() from public;
grant execute on function public.get_public_listings() to anon, authenticated;
