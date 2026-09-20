begin;
-- Transactional integration test: fixtures and all mutations roll back.
insert into public.workspaces(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'QR submission tests');
insert into public.properties(id, workspace_id, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'QR test property');
insert into public.units(id, workspace_id, property_id, name, maintenance_access_token_hash, maintenance_access_enabled) values
('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'A', repeat('1',64), true),
('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'B', repeat('2',64), true);


-- Do not let queue-wide claim operations touch live pending deliveries.
do $$ begin
 if exists(select 1 from public.maintenance_email_outbox where status in ('queued','sending')) then
 raise exception 'Run email database tests only with an empty pending queue'; end if;
end $$;
insert into public.property_members(workspace_id, property_id, email, role, maintenance_email_enabled) values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3','enabled@example.test','admin',true),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3','disabled@example.test','admin',false);
do $$
declare claim jsonb; delivery jsonb; payload jsonb; again jsonb;
sid uuid := '11111111-1111-4111-8111-111111111112';
begin
 if has_table_privilege('authenticated','public.maintenance_email_outbox','select')
 or has_function_privilege('anon','public.claim_maintenance_email()','execute') then
 raise exception 'Email internals exposed'; end if;
 claim := public.claim_public_maintenance_submission(repeat('1',64),sid,repeat('a',64));
 if exists(select 1 from public.maintenance_email_outbox) then raise exception 'Queued before completion'; end if;
 perform public.finalize_public_maintenance_submission(sid,(claim->>'attempt_id')::uuid,
 '{"title":"Email fixture","description":"Tap leaking","contactEmail":"tenant@example.test"}','[]');
 if (select count(*) from public.maintenance_email_outbox) <> 1 then raise exception 'Recipient selection failed'; end if;
 update public.maintenance_public_submissions set state='completed' where id=sid;
 if (select count(*) from public.maintenance_email_outbox) <> 1 then raise exception 'Duplicate notification'; end if;
 delivery := public.claim_maintenance_email();
 if delivery->>'recipient_email' <> 'enabled@example.test' or delivery->'snapshot'->>'description' <> 'Tap leaking' then raise exception 'Snapshot incorrect'; end if;
 if public.claim_maintenance_email() is not null then raise exception 'Lease not respected'; end if;
 payload := public.prepare_maintenance_email((delivery->>'id')::uuid,(delivery->>'attempt_id')::uuid,
 '{"to":["enabled@example.test"],"text":"original"}');
 again := public.prepare_maintenance_email((delivery->>'id')::uuid,(delivery->>'attempt_id')::uuid,
 '{"to":["enabled@example.test"],"text":"changed"}');
 if payload <> again then raise exception 'Retry payload changed'; end if;
 perform public.finish_maintenance_email((delivery->>'id')::uuid,(delivery->>'attempt_id')::uuid,null,'provider_429',true);
 if public.claim_maintenance_email() is not null then raise exception 'Backoff ignored'; end if;
 update public.maintenance_email_outbox set next_attempt_at=now()-interval '1 minute';
 again := public.claim_maintenance_email();
 if public.finish_maintenance_email((delivery->>'id')::uuid,(delivery->>'attempt_id')::uuid,'stale') then raise exception 'Stale worker accepted'; end if;
 perform public.finish_maintenance_email((again->>'id')::uuid,(again->>'attempt_id')::uuid,'fixture-provider-id');
 if public.claim_maintenance_email() is not null then raise exception 'Sent email reclaimed'; end if;
 update public.maintenance_email_outbox set status='queued', next_attempt_at=now(),first_attempt_at=now()-interval '24 hours';
 perform public.claim_maintenance_email();
 if (select status from public.maintenance_email_outbox) <> 'failed' then raise exception 'Expired idempotency window retried'; end if;
 update public.maintenance_email_outbox set status='queued',first_attempt_at=null,attempts=0;
 update public.property_members set maintenance_email_enabled=false where email='enabled@example.test';
 perform public.claim_maintenance_email();
 if (select status from public.maintenance_email_outbox) <> 'cancelled' then raise exception 'Revoked recipient retained'; end if;
end $$;
select 'Email recipient, snapshot, deduplication, lease, payload, backoff, stale worker, expiry and revocation checks passed' as result;
rollback;
