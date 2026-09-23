begin;
create table public.listing_inquiry_settings (id boolean primary key default true check(id), enabled boolean not null default false);
insert into public.listing_inquiry_settings values(true,false);
alter table public.listing_inquiry_settings enable row level security;
revoke all on public.listing_inquiry_settings from public,anon,authenticated;
grant all on public.listing_inquiry_settings to service_role;
create table public.listing_inquiries (
 id uuid primary key, unit_id uuid not null references public.units(id),
 property_id uuid not null references public.properties(id), workspace_id uuid not null references public.workspaces(id),
 contact_name text not null, contact_email text not null, message text not null,
 ip_hash text not null, created_at timestamptz not null default now()
);
alter table public.listing_inquiries enable row level security;
revoke all on public.listing_inquiries from public,anon,authenticated;
grant all on public.listing_inquiries to service_role;
create index listing_inquiries_rate on public.listing_inquiries(ip_hash,created_at);
create table public.listing_inquiry_email_outbox (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.listing_inquiries(id) on delete cascade,
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
create index listing_inquiry_email_outbox_pending_idx
  on public.listing_inquiry_email_outbox(next_attempt_at) where status in ('queued', 'sending');
alter table public.listing_inquiry_email_outbox enable row level security;
revoke all on public.listing_inquiry_email_outbox from public, anon, authenticated;
grant all on public.listing_inquiry_email_outbox to service_role;

create function public.claim_listing_inquiry_email()
returns jsonb language plpgsql security definer set search_path = public as $$
declare delivery public.listing_inquiry_email_outbox;
begin
  -- Resend keeps idempotency keys for 24 hours. Never automatically retry a
  -- possibly accepted email after that window, including after worker downtime.
  update public.listing_inquiry_email_outbox set status = 'failed', last_error_code = 'retry_window_expired'
  where status in ('queued', 'sending') and first_attempt_at < now() - interval '23 hours';
  update public.listing_inquiry_email_outbox set status = 'failed', last_error_code = 'retry_limit'
  where status in ('queued', 'sending') and attempts >= 8 and coalesce(locked_until, now()) <= now();
  update public.listing_inquiry_email_outbox outbox set status = 'cancelled', last_error_code = 'recipient_disabled'
  where outbox.status in ('queued', 'sending') and not exists (
    select 1 from public.property_members member
    join public.listing_inquiries request on request.property_id = member.property_id
      and request.workspace_id = member.workspace_id
    where request.id = outbox.request_id and member.role = 'admin'
      and member.listing_inquiry_email_enabled and lower(trim(member.email)) = outbox.recipient_email
  );
  select * into delivery from public.listing_inquiry_email_outbox
  where (status = 'queued' and next_attempt_at <= now())
     or (status = 'sending' and locked_until <= now())
  order by next_attempt_at, created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.listing_inquiry_email_outbox set status = 'sending', attempts = attempts + 1,
    attempt_id = gen_random_uuid(), locked_until = now() + interval '2 minutes',
    first_attempt_at = coalesce(first_attempt_at, now())
  where id = delivery.id returning * into delivery;
  return to_jsonb(delivery);
end;
$$;

create function public.prepare_listing_inquiry_email(target_id uuid, target_attempt_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare delivery public.listing_inquiry_email_outbox;
begin
  select * into delivery from public.listing_inquiry_email_outbox
  where id = target_id and attempt_id = target_attempt_id and status = 'sending' for update;
  if not found then return null; end if;
  if not exists (
    select 1 from public.property_members member
    join public.listing_inquiries request on request.property_id = member.property_id
      and request.workspace_id = member.workspace_id
    where request.id = delivery.request_id and member.role = 'admin'
      and member.listing_inquiry_email_enabled and lower(trim(member.email)) = delivery.recipient_email
  ) then
    update public.listing_inquiry_email_outbox set status = 'cancelled', last_error_code = 'recipient_disabled' where id = target_id;
    return null;
  end if;
  if payload->'to' is distinct from jsonb_build_array(delivery.recipient_email) then
    raise exception 'Email recipient does not match the saved notification.';
  end if;
  -- Freeze sender, content and link before the first network request. Retries
  -- must use the identical provider payload even after configuration changes.
  update public.listing_inquiry_email_outbox set email_payload = coalesce(email_payload, payload)
  where id = target_id returning * into delivery;
  return delivery.email_payload;
end;
$$;

create function public.finish_listing_inquiry_email(
  target_id uuid, target_attempt_id uuid, provider_id text,
  error_code text default null, retryable boolean default false
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.listing_inquiry_email_outbox set
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

revoke all on function public.claim_listing_inquiry_email() from public, anon, authenticated;
revoke all on function public.prepare_listing_inquiry_email(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finish_listing_inquiry_email(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_listing_inquiry_email() to service_role;
grant execute on function public.prepare_listing_inquiry_email(uuid, uuid, jsonb) to service_role;
grant execute on function public.finish_listing_inquiry_email(uuid, uuid, text, text, boolean) to service_role;



create function public.listing_inquiry_available(target_unit_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from units u join property_members m on m.property_id=u.property_id and m.workspace_id=u.workspace_id
 where (select enabled from listing_inquiry_settings where id=true) and u.id=target_unit_id and u.listing_published and u.listing_status in ('available','coming-soon')
 and m.role='admin' and trim(m.email) ~ '^[^[:space:]@<>",;]+@[^[:space:]@<>",;]+\.[^[:space:]@<>",;]+$');
$$;
revoke all on function public.listing_inquiry_available(uuid) from public;
grant execute on function public.listing_inquiry_available(uuid) to anon,authenticated;
create function public.submit_listing_inquiry(submission_id uuid,target_unit_id uuid,sender_name text,sender_email text,inquiry_message text,hashed_ip text)
returns boolean language plpgsql security definer set search_path=public as $$
declare u public.units; p public.properties; existing public.listing_inquiries;
begin
 perform pg_advisory_xact_lock(hashtextextended(hashed_ip,0));
 perform pg_advisory_xact_lock(hashtextextended(submission_id::text,1));
 select * into existing from listing_inquiries where id=submission_id;
 if found then
  if existing.unit_id<>target_unit_id or existing.contact_name<>sender_name or existing.contact_email<>sender_email or existing.message<>inquiry_message then raise exception 'submission_conflict'; end if;
  return true;
 end if;
 if length(sender_name) not between 1 and 100 or length(sender_email)>254 or sender_email !~ '^[^[:space:]@<>",;]+@[^[:space:]@<>",;]+\.[^[:space:]@<>",;]+$'
 or length(inquiry_message) not between 1 and 3000 or length(hashed_ip)<>64 then raise exception 'invalid_input'; end if;
 if (select count(*) from listing_inquiries where ip_hash=hashed_ip and created_at>now()-interval '1 hour')>=5 then raise exception 'rate_limited'; end if;
 if not listing_inquiry_available(target_unit_id) then raise exception 'unavailable'; end if;
 select * into u from units where id=target_unit_id;
 select * into p from properties where id=u.property_id;
 insert into listing_inquiries values(submission_id,u.id,u.property_id,u.workspace_id,sender_name,sender_email,inquiry_message,hashed_ip,now());
 insert into listing_inquiry_email_outbox(request_id,recipient_email,snapshot)
 select submission_id,lower(trim(m.email)),jsonb_build_object('requestId',submission_id,'propertyId',p.id,'propertyName',p.name,'unitName',u.name,
 'description',inquiry_message,'contactName',sender_name,'contactEmail',sender_email,'propertySlug',public.listing_slug(p.name),'unitSlug',public.listing_slug(u.name))
 from property_members m where m.property_id=u.property_id and m.workspace_id=u.workspace_id and m.role='admin'
 and trim(m.email) ~ '^[^[:space:]@<>",;]+@[^[:space:]@<>",;]+\.[^[:space:]@<>",;]+$'
 on conflict(request_id,recipient_email) do nothing;
 return true;
end; $$;
revoke all on function public.submit_listing_inquiry(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_listing_inquiry(uuid,uuid,text,text,text,text) to service_role;
commit;
