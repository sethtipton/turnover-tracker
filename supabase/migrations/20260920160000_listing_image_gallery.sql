alter table public.listing_images add column removed_at timestamptz;
alter table public.listing_images add constraint listing_image_label_length check (length(label)<=120);
create function public.listing_image_is_public(object_name text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from listing_images i join units u on u.id=i.unit_id
 where object_name=i.unit_id::text || '/' || i.id::text || '.jpg'
 and i.ready and i.removed_at is null and u.listing_published and u.listing_status in ('available','coming-soon'));
$$;
revoke all on function public.listing_image_is_public(text) from public;
grant execute on function public.listing_image_is_public(text) to anon,authenticated;
create policy listing_images_public_read on storage.objects for select to anon,authenticated
using(bucket_id='listing-images' and public.listing_image_is_public(name));
create function public.get_public_listing_images(target_unit_id uuid)
returns table(id uuid,unit_id uuid,label text,sort_order integer,created_at timestamptz)
language sql stable security definer set search_path=public as $$
 select i.id,i.unit_id,i.label,i.sort_order,i.created_at from listing_images i join units u on u.id=i.unit_id
 where i.unit_id=target_unit_id and i.ready and i.removed_at is null
 and u.listing_published and u.listing_status in ('available','coming-soon')
 order by i.sort_order,i.created_at,i.id;
$$;
revoke all on function public.get_public_listing_images(uuid) from public;
grant execute on function public.get_public_listing_images(uuid) to anon,authenticated;
create function public.reorder_listing_images(target_unit_id uuid, image_ids uuid[]) returns void
language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from public.units where id=target_unit_id and public.can_edit_property(property_id,workspace_id) for update;
 if not found then raise exception 'Not authorized'; end if;
 if cardinality(image_ids) <> (select count(*) from listing_images where unit_id=target_unit_id and ready and removed_at is null)
 or cardinality(image_ids) <> (select count(distinct x) from unnest(image_ids) x)
 or exists(select 1 from unnest(image_ids) x where not exists(select 1 from listing_images i where i.id=x and i.unit_id=target_unit_id and i.ready and i.removed_at is null)) then
 raise exception 'Photos changed. Refresh and try again.'; end if;
 update listing_images i set sort_order=ordered.position-1 from unnest(image_ids) with ordinality ordered(id,position) where i.id=ordered.id;
end; $$;
revoke all on function public.reorder_listing_images(uuid,uuid[]) from public;
grant execute on function public.reorder_listing_images(uuid,uuid[]) to authenticated;
