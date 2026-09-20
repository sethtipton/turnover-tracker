begin;

-- A server-only receipt reserves one case ID across retries. Uploads are staged
-- privately; finalization publishes the case and its media in one transaction.
create table public.maintenance_public_submissions (
  id uuid primary key,
  unit_id uuid not null references public.units(id) on delete cascade,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  request_id uuid not null unique default gen_random_uuid(),
  attempt_id uuid not null default gen_random_uuid(),
  state text not null default 'processing' check (state in ('processing', 'completed', 'failed')),
  upload_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.maintenance_public_submissions enable row level security;
revoke all on public.maintenance_public_submissions from public, anon, authenticated;
grant all on public.maintenance_public_submissions to service_role;

drop function public.claim_public_maintenance_submission(text);
create function public.claim_public_maintenance_submission(
  target_token_hash text, target_submission_id uuid, target_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_unit public.units;
  receipt public.maintenance_public_submissions;
  cleanup_paths text[] := '{}';
begin
  -- Serialize the same submission even if a caller tries a different unit.
  perform pg_advisory_xact_lock(hashtextextended(target_submission_id::text, 0));
  select * into target_unit from public.units
  where maintenance_access_token_hash = target_token_hash and maintenance_access_enabled
  for update;
  if not found then return jsonb_build_object('status', 'invalid'); end if;

  select * into receipt from public.maintenance_public_submissions
  where id = target_submission_id for update;
  if found then
    if receipt.unit_id <> target_unit.id or receipt.payload_hash <> target_payload_hash then
      return jsonb_build_object('status', 'conflict');
    end if;
    if receipt.state = 'completed' then return jsonb_build_object('status', 'completed'); end if;
    if receipt.state = 'processing' and receipt.updated_at > now() - interval '10 minutes' then
      return jsonb_build_object('status', 'processing');
    end if;
    cleanup_paths := receipt.upload_paths;
    update public.maintenance_public_submissions
    set state = 'processing', attempt_id = gen_random_uuid(), upload_paths = '{}', updated_at = now()
    where id = target_submission_id returning * into receipt;
  else
    if target_unit.maintenance_access_last_submitted_at > now() - interval '30 seconds' then
      return jsonb_build_object('status', 'throttled');
    end if;
    insert into public.maintenance_public_submissions(id, unit_id, payload_hash)
    values (target_submission_id, target_unit.id, target_payload_hash) returning * into receipt;
    update public.units set maintenance_access_last_submitted_at = now() where id = target_unit.id;
  end if;
  return jsonb_build_object('status', 'claimed', 'request_id', receipt.request_id,
    'attempt_id', receipt.attempt_id, 'workspace_id', target_unit.workspace_id,
    'property_id', target_unit.property_id, 'unit_id', target_unit.id, 'cleanup_paths', cleanup_paths);
end;
$$;

create function public.finalize_public_maintenance_submission(
  target_submission_id uuid, target_attempt_id uuid, request_data jsonb, media jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  receipt public.maintenance_public_submissions;
  target_unit public.units;
  attachment jsonb;
begin
  select * into receipt from public.maintenance_public_submissions
  where id = target_submission_id for update;
  if not found or receipt.attempt_id <> target_attempt_id or receipt.state <> 'processing' then
    raise exception 'Submission attempt is no longer active.';
  end if;
  select * into target_unit from public.units where id = receipt.unit_id;
  insert into public.maintenance_requests (
    id, workspace_id, property_id, unit_id, source_type, title, original_description,
    reporter_name, reporter_email, reporter_phone
  ) values (
    receipt.request_id, target_unit.workspace_id, target_unit.property_id, target_unit.id,
    'qr-public', request_data->>'title', request_data->>'description',
    nullif(request_data->>'contactName', ''), nullif(request_data->>'contactEmail', ''),
    nullif(request_data->>'contactPhone', '')
  );
  if coalesce(request_data->>'description', '') <> '' then
    insert into public.maintenance_request_entries (
      maintenance_request_id, author_type, author_email, entry_type, visibility, content
    ) values (receipt.request_id, 'tenant', nullif(request_data->>'contactEmail', ''),
      'description', 'tenant', request_data->>'description');
  end if;
  for attachment in select value from jsonb_array_elements(media) loop
    if not (attachment->>'storage_path' = any(receipt.upload_paths)) then
      raise exception 'Attachment is not part of this submission.';
    end if;
    insert into public.maintenance_request_entries (
      id, maintenance_request_id, author_type, author_email, entry_type, visibility, content
    ) values ((attachment->>'entry_id')::uuid, receipt.request_id, 'tenant',
      nullif(request_data->>'contactEmail', ''), attachment->>'kind', 'tenant', '');
    insert into public.maintenance_attachments (
      maintenance_request_id, entry_id, visibility, kind, file_name, mime_type, storage_path
    ) values (receipt.request_id, (attachment->>'entry_id')::uuid, 'tenant',
      attachment->>'kind', attachment->>'file_name', attachment->>'mime_type', attachment->>'storage_path');
  end loop;
  update public.maintenance_public_submissions set state = 'completed', updated_at = now()
  where id = receipt.id;
end;
$$;

-- Lock against finalization before cleaning up. A lost HTTP response after a
-- successful commit must never cause the function to delete saved attachments.
create function public.fail_public_maintenance_submission(target_submission_id uuid, target_attempt_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare receipt public.maintenance_public_submissions;
begin
  select * into receipt from public.maintenance_public_submissions
  where id = target_submission_id for update;
  if receipt.attempt_id is distinct from target_attempt_id then return 'superseded'; end if;
  if receipt.state = 'completed' then return 'completed'; end if;
  update public.maintenance_public_submissions set state = 'failed', updated_at = now()
  where id = receipt.id;
  return 'failed';
end;
$$;

revoke all on function public.claim_public_maintenance_submission(text, uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_public_maintenance_submission(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_public_maintenance_submission(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_public_maintenance_submission(text, uuid, text) to service_role;
grant execute on function public.finalize_public_maintenance_submission(uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.fail_public_maintenance_submission(uuid, uuid) to service_role;

commit;
