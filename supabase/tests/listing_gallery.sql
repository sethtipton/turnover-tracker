begin;
select set_config('test.unit_id',(select id::text from public.units limit 1),true);
update public.units set listing_published=true,listing_status='available' where id=current_setting('test.unit_id')::uuid;
insert into public.listing_images(id,unit_id,original_name,label,ready,sort_order)
values('bbbbbbbb-1111-4111-8111-111111111111',current_setting('test.unit_id')::uuid,'test.jpg','Kitchen',true,0),
('bbbbbbbb-2222-4222-8222-222222222222',current_setting('test.unit_id')::uuid,'draft.jpg','Draft',false,1);
set local role anon;
do $$ begin
 if not exists(select 1 from public.get_public_listing_images(current_setting('test.unit_id')::uuid) where id='bbbbbbbb-1111-4111-8111-111111111111' and label='Kitchen') then raise exception 'Published photo missing'; end if;
 if exists(select 1 from public.get_public_listing_images(current_setting('test.unit_id')::uuid) where id='bbbbbbbb-2222-4222-8222-222222222222') then raise exception 'Draft photo exposed'; end if;
 if not public.listing_image_is_public(current_setting('test.unit_id') || '/bbbbbbbb-1111-4111-8111-111111111111.jpg') then raise exception 'Public storage eligibility missing'; end if;
end $$;
reset role;
update public.listing_images set removed_at=now() where id='bbbbbbbb-1111-4111-8111-111111111111';
set local role anon;
do $$ begin
 if public.listing_image_is_public(current_setting('test.unit_id') || '/bbbbbbbb-1111-4111-8111-111111111111.jpg') then raise exception 'Removed image exposed'; end if;
end $$;
reset role;
update public.listing_images set removed_at=null where id='bbbbbbbb-1111-4111-8111-111111111111';
update public.units set listing_published=false where id=current_setting('test.unit_id')::uuid;
set local role anon;
do $$ begin
 if exists(select 1 from public.get_public_listing_images(current_setting('test.unit_id')::uuid)) then raise exception 'Unpublished photos exposed'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","email":"unassigned-listing-test@example.invalid","role":"authenticated"}',true);
do $$ begin
 begin
 perform public.reorder_listing_images(current_setting('test.unit_id')::uuid,array['bbbbbbbb-1111-4111-8111-111111111111'::uuid]);
 raise exception 'Unauthorized reorder succeeded';
 exception when raise_exception then if sqlerrm <> 'Not authorized' then raise; end if; end;
end $$;
rollback;
