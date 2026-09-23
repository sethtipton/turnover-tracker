create table public.listing_images (
  id uuid primary key,
  unit_id uuid not null references public.units(id) on delete cascade,
  original_name text not null,
  label text not null default '',
  sort_order integer not null default 0,
  ready boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.listing_images enable row level security;
grant select, insert, update on public.listing_images to authenticated;
create policy listing_images_admin on public.listing_images for all to authenticated
using (exists (select 1 from public.units u where u.id=unit_id and public.can_edit_property(u.property_id,u.workspace_id)))
with check (exists (select 1 from public.units u where u.id=unit_id and public.can_edit_property(u.property_id,u.workspace_id)));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('listing-images','listing-images',false,10485760,array['image/jpeg'])
on conflict (id) do nothing;
create policy listing_images_objects on storage.objects for all to authenticated
using (bucket_id='listing-images' and exists (select 1 from public.listing_images i where name=i.unit_id::text || '/' || i.id::text || '.jpg'))
with check (bucket_id='listing-images' and exists (select 1 from public.listing_images i where name=i.unit_id::text || '/' || i.id::text || '.jpg'));
