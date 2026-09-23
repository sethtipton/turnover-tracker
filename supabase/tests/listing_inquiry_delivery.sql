-- Transactional regression for the actual SQL worker functions. No email is sent.
begin;
do $$
declare d jsonb; payload jsonb;
begin
 d:=public.claim_listing_inquiry_email();
 if d is null then raise notice 'No pending delivery fixture; enqueue a controlled test before running this test.'; return; end if;
 payload:=public.prepare_listing_inquiry_email((d->>'id')::uuid,(d->>'attempt_id')::uuid,jsonb_build_object('to',jsonb_build_array(d->>'recipient_email')));
 if payload is null then raise exception 'Assigned admin was rejected during preparation'; end if;
 if not public.finish_listing_inquiry_email((d->>'id')::uuid,(d->>'attempt_id')::uuid,null,'test_retry',true) then raise exception 'Delivery retry did not update'; end if;
end $$;
rollback;
