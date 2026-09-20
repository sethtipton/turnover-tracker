begin;
-- Transactional integration test: fixtures and all mutations roll back.
insert into public.workspaces(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'QR submission tests');
insert into public.properties(id, workspace_id, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'QR test property');
insert into public.units(id, workspace_id, property_id, name, maintenance_access_token_hash, maintenance_access_enabled) values
('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'A', repeat('1',64), true),
('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'B', repeat('2',64), true);

do $$
declare
  sid uuid := '11111111-1111-4111-8111-111111111112';
  claim jsonb;
  retry jsonb;
  details jsonb := '{"title":"QR test", "description":"Tap leaking", "contactName":"Test reporter"}';
  media jsonb;
  result text;
begin
  if has_function_privilege('anon', 'public.claim_public_maintenance_submission(text,uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.finalize_public_maintenance_submission(uuid,uuid,jsonb,jsonb)', 'execute')
    or has_function_privilege('anon', 'public.fail_public_maintenance_submission(uuid,uuid)', 'execute')
    or has_table_privilege('authenticated', 'public.maintenance_public_submissions', 'select') then
    raise exception 'Submission internals exposed';
  end if;
  claim := public.claim_public_maintenance_submission(repeat('1',64), sid, repeat('a',64));
  if claim->>'status' <> 'claimed' then raise exception 'Initial claim failed'; end if;
  if exists(select 1 from public.maintenance_requests where id=(claim->>'request_id')::uuid) then raise exception 'Partial case published'; end if;
  if public.claim_public_maintenance_submission(repeat('1',64),sid,repeat('a',64))->>'status' <> 'processing' then raise exception 'Concurrent retry not blocked'; end if;
  if public.claim_public_maintenance_submission(repeat('1',64),sid,repeat('b',64))->>'status' <> 'conflict' then raise exception 'Changed payload accepted'; end if;
  if public.claim_public_maintenance_submission(repeat('2',64),sid,repeat('a',64))->>'status' <> 'conflict' then raise exception 'Cross-unit replay accepted'; end if;
  if public.claim_public_maintenance_submission(repeat('1',64),gen_random_uuid(),repeat('a',64))->>'status' <> 'throttled' then raise exception 'Rate limit missing'; end if;
  begin
    perform public.finalize_public_maintenance_submission(sid,(claim->>'attempt_id')::uuid,details,'[{"entry_id":"22222222-2222-4222-8222-222222222222","kind":"photo","storage_path":"wrong-path"}]');
    raise exception 'Invalid media accepted';
  exception when raise_exception then
    if sqlerrm <> 'Attachment is not part of this submission.' then raise; end if;
  end;
  if exists(select 1 from public.maintenance_requests where id=(claim->>'request_id')::uuid) then raise exception 'Failed finalization left a partial case'; end if;
  result := public.fail_public_maintenance_submission(sid,(claim->>'attempt_id')::uuid);
  if result <> 'failed' then raise exception 'Abort failed'; end if;
  retry := public.claim_public_maintenance_submission(repeat('1',64),sid,repeat('a',64));
  if retry->>'status' <> 'claimed' or retry->>'request_id' <> claim->>'request_id' or retry->>'attempt_id' = claim->>'attempt_id' then raise exception 'Failed retry identity incorrect'; end if;
  begin
    perform public.finalize_public_maintenance_submission(sid,(claim->>'attempt_id')::uuid,details,'[]');
    raise exception 'Old attempt accepted';
  exception when raise_exception then
    if sqlerrm <> 'Submission attempt is no longer active.' then raise; end if;
  end;
  update public.maintenance_public_submissions set upload_paths=array['fixture-path'] where id=sid;
  media := '[{"entry_id":"22222222-2222-4222-8222-222222222222","kind":"photo","storage_path":"fixture-path","file_name":"test.png","mime_type":"image/png"}]';
  perform public.finalize_public_maintenance_submission(sid,(retry->>'attempt_id')::uuid,details,media);
  if (select count(*) from public.maintenance_requests where id=(claim->>'request_id')::uuid and unit_id='cccccccc-cccc-cccc-cccc-ccccccccccc2' and reporter_name='Test reporter') <> 1
    or (select count(*) from public.maintenance_request_entries where maintenance_request_id=(claim->>'request_id')::uuid) <> 2
    or (select count(*) from public.maintenance_attachments where maintenance_request_id=(claim->>'request_id')::uuid) <> 1 then raise exception 'Complete case data incorrect'; end if;
  if public.claim_public_maintenance_submission(repeat('1',64),sid,repeat('a',64))->>'status' <> 'completed' then raise exception 'Completed replay not recognized'; end if;
  if public.fail_public_maintenance_submission(sid,(retry->>'attempt_id')::uuid) <> 'completed' then raise exception 'Abort could discard committed case'; end if;
  update public.units set maintenance_access_enabled=false where id='cccccccc-cccc-cccc-cccc-ccccccccccc2';
  if public.claim_public_maintenance_submission(repeat('1',64),gen_random_uuid(),repeat('a',64))->>'status' <> 'invalid' then raise exception 'Disabled QR accepted'; end if;
end;
$$;
select 'Submission identity, scope, rate limit, atomic finalization, and retry tests passed' as result;
rollback;
