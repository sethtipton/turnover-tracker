update public.listing_inquiry_settings set enabled=true;
-- Execute after the migration in the SAME transaction, then roll back.
select set_config('test.unit',(select id::text from units limit 1),true);
update units set listing_published=true,listing_status='available' where id=current_setting('test.unit')::uuid;
-- Replace recipient fixtures only inside this rolled-back transaction.
delete from property_members where property_id=(select property_id from units where id=current_setting('test.unit')::uuid);
do $$ begin
 if listing_inquiry_available(current_setting('test.unit')::uuid) then raise exception 'No recipients must hide action'; end if;
end $$;
insert into property_members(workspace_id,property_id,email,role)
select workspace_id,property_id,recipient,role from units cross join (values ('first@example.invalid','admin'),('second@example.invalid','admin'),('viewer@example.invalid','viewer'),('','admin')) as recipients(recipient,role)
where id=current_setting('test.unit')::uuid;
select submit_listing_inquiry('cccccccc-1111-4111-8111-111111111111',current_setting('test.unit')::uuid,'Test sender','sender@example.invalid','Question about rent',repeat('a',64));
select submit_listing_inquiry('cccccccc-1111-4111-8111-111111111111',current_setting('test.unit')::uuid,'Test sender','sender@example.invalid','Question about rent',repeat('a',64));
do $$ begin
 if (select count(*) from listing_inquiry_email_outbox)<>2 then raise exception 'Expected exactly two admin emails, no duplicate on retry'; end if;
 if exists(select 1 from listing_inquiry_email_outbox where recipient_email not in ('first@example.invalid','second@example.invalid')) then raise exception 'Wrong recipient'; end if;
end $$;
update units set listing_published=false where id=current_setting('test.unit')::uuid;
do $$ begin
 if listing_inquiry_available(current_setting('test.unit')::uuid) then raise exception 'Unpublished listing enabled'; end if;
end $$;
