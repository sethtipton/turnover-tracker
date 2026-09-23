begin;
insert into public.listing_images(id,unit_id,original_name)
select 'aaaaaaaa-1111-4111-8111-111111111111',id,'RLS test' from public.units limit 1;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","email":"unassigned-listing-test@example.invalid","role":"authenticated"}',true);
do $$
begin
 if exists(select 1 from public.listing_images where id='aaaaaaaa-1111-4111-8111-111111111111') then raise exception 'Unassigned user can read photos'; end if;
 if exists(select 1 from storage.objects where bucket_id='listing-images') then raise exception 'Unassigned user can read photo objects'; end if;
 begin
   insert into public.listing_images(id,unit_id,original_name) values ('aaaaaaaa-2222-4222-8222-222222222222','00000000-0000-4000-8000-000000000002','Unauthorized');
   raise exception 'Unassigned user could insert';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set local role anon;
do $$
begin
 begin
   perform * from public.listing_images;
   raise exception 'Anonymous user can read metadata';
 exception when insufficient_privilege then null;
 end;
 if exists(select 1 from storage.objects where bucket_id='listing-images') then raise exception 'Anonymous user can read objects'; end if;
end $$;
rollback;
