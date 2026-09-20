begin;

-- Opt in property admins explicitly; enabling email never grants property access.
alter table public.property_members
  add column maintenance_email_enabled boolean not null default false;

create table public.maintenance_email_outbox (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  recipient_email text not null,
  snapshot jsonb not null,
  email_payload jsonb,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  attempt_id uuid,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  provider_email_id text,
  last_error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (request_id, recipient_email)
);
create index maintenance_email_outbox_pending_idx
  on public.maintenance_email_outbox(next_attempt_at) where status in ('queued', 'sending');
alter table public.maintenance_email_outbox enable row level security;
revoke all on public.maintenance_email_outbox from public, anon, authenticated;
grant all on public.maintenance_email_outbox to service_role;

create function public.enqueue_public_maintenance_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.state <> 'completed' or old.state = 'completed' then return new; end if;
  insert into public.maintenance_email_outbox(request_id, recipient_email, snapshot)
  select request.id, lower(trim(member.email)), jsonb_build_object(
    'requestId', request.id, 'propertyId', request.property_id,
    'propertyName', property.name, 'unitName', unit.name,
    'description', request.original_description, 'title', request.title,
    'contactName', request.reporter_name, 'contactEmail', request.reporter_email,
    'contactPhone', request.reporter_phone,
    'photoCount', (select count(*) from public.maintenance_attachments attachment
      where attachment.maintenance_request_id = request.id and attachment.kind = 'photo'),
    'audioCount', (select count(*) from public.maintenance_attachments attachment
      where attachment.maintenance_request_id = request.id and attachment.kind = 'audio')
  )
  from public.maintenance_requests request
  join public.properties property on property.id = request.property_id
  join public.units unit on unit.id = request.unit_id
  join public.property_members member on member.property_id = request.property_id
    and member.workspace_id = request.workspace_id
    and member.role = 'admin' and member.maintenance_email_enabled
  where request.id = new.request_id and request.source_type = 'qr-public'
  on conflict (request_id, recipient_email) do nothing;
  return new;
end;
$$;
create trigger queue_public_maintenance_email
  after update of state on public.maintenance_public_submissions
  for each row execute function public.enqueue_public_maintenance_email();
revoke all on function public.enqueue_public_maintenance_email() from public, anon, authenticated;

create function public.claim_maintenance_email()
returns jsonb language plpgsql security definer set search_path = public as $$
declare delivery public.maintenance_email_outbox;
begin
  -- Resend keeps idempotency keys for 24 hours. Never automatically retry a
  -- possibly accepted email after that window, including after worker downtime.
  update public.maintenance_email_outbox set status = 'failed', last_error_code = 'retry_window_expired'
  where status in ('queued', 'sending') and first_attempt_at < now() - interval '23 hours';
  update public.maintenance_email_outbox set status = 'failed', last_error_code = 'retry_limit'
  where status in ('queued', 'sending') and attempts >= 8 and coalesce(locked_until, now()) <= now();
  update public.maintenance_email_outbox outbox set status = 'cancelled', last_error_code = 'recipient_disabled'
  where outbox.status in ('queued', 'sending') and not exists (
    select 1 from public.property_members member
    join public.maintenance_requests request on request.property_id = member.property_id
      and request.workspace_id = member.workspace_id
    where request.id = outbox.request_id and member.role = 'admin'
      and member.maintenance_email_enabled and lower(trim(member.email)) = outbox.recipient_email
  );
  select * into delivery from public.maintenance_email_outbox
  where (status = 'queued' and next_attempt_at <= now())
     or (status = 'sending' and locked_until <= now())
  order by next_attempt_at, created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.maintenance_email_outbox set status = 'sending', attempts = attempts + 1,
    attempt_id = gen_random_uuid(), locked_until = now() + interval '2 minutes',
    first_attempt_at = coalesce(first_attempt_at, now())
  where id = delivery.id returning * into delivery;
  return to_jsonb(delivery);
end;
$$;

create function public.prepare_maintenance_email(target_id uuid, target_attempt_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare delivery public.maintenance_email_outbox;
begin
  select * into delivery from public.maintenance_email_outbox
  where id = target_id and attempt_id = target_attempt_id and status = 'sending' for update;
  if not found then return null; end if;
  if not exists (
    select 1 from public.property_members member
    join public.maintenance_requests request on request.property_id = member.property_id
      and request.workspace_id = member.workspace_id
    where request.id = delivery.request_id and member.role = 'admin'
      and member.maintenance_email_enabled and lower(trim(member.email)) = delivery.recipient_email
  ) then
    update public.maintenance_email_outbox set status = 'cancelled', last_error_code = 'recipient_disabled' where id = target_id;
    return null;
  end if;
  if payload->'to' is distinct from jsonb_build_array(delivery.recipient_email) then
    raise exception 'Email recipient does not match the saved notification.';
  end if;
  -- Freeze sender, content and link before the first network request. Retries
  -- must use the identical provider payload even after configuration changes.
  update public.maintenance_email_outbox set email_payload = coalesce(email_payload, payload)
  where id = target_id returning * into delivery;
  return delivery.email_payload;
end;
$$;

create function public.finish_maintenance_email(
  target_id uuid, target_attempt_id uuid, provider_id text,
  error_code text default null, retryable boolean default false
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.maintenance_email_outbox set
    status = case when provider_id is not null then 'sent'
      when retryable and attempts < 8 and first_attempt_at > now() - interval '23 hours' then 'queued'
      else 'failed' end,
    provider_email_id = provider_id,
    sent_at = case when provider_id is not null then now() else null end,
    last_error_code = error_code,
    next_attempt_at = now() + make_interval(secs => least(3600, 60 * power(2, attempts - 1)::integer)),
    locked_until = null
  where id = target_id and attempt_id = target_attempt_id and status = 'sending';
  return found;
end;
$$;

revoke all on function public.claim_maintenance_email() from public, anon, authenticated;
revoke all on function public.prepare_maintenance_email(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finish_maintenance_email(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_maintenance_email() to service_role;
grant execute on function public.prepare_maintenance_email(uuid, uuid, jsonb) to service_role;
grant execute on function public.finish_maintenance_email(uuid, uuid, text, text, boolean) to service_role;

commit;
