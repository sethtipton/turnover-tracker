-- Inquiries go to all assigned property admins, without maintenance opt-in.
create or replace function public.claim_listing_inquiry_email()
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
      and lower(trim(member.email)) = outbox.recipient_email
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

create or replace function public.prepare_listing_inquiry_email(target_id uuid, target_attempt_id uuid, payload jsonb)
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
      and lower(trim(member.email)) = delivery.recipient_email
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

