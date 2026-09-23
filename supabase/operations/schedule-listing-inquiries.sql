-- Run only after configuring the Edge Function and creating these Vault secrets:
-- listing_inquiry_worker_url: full deliver-listing-inquiries function URL
-- maintenance_email_job_secret: same value as MAINTENANCE_EMAIL_JOB_SECRET
-- Store values through Vault; never commit credentials into this file.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
  if (select count(*) from vault.decrypted_secrets where name in
    ('listing_inquiry_worker_url','maintenance_email_job_secret')) <> 2 then
    raise exception 'Configure the two maintenance email Vault secrets first';
  end if;
end $$;
select cron.schedule(
  'deliver-listing-inquiries',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='listing_inquiry_worker_url'),
      headers := jsonb_build_object('Content-Type','application/json','Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='maintenance_email_job_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )
    where exists(select 1 from public.listing_inquiry_email_outbox
      where (status='queued' and next_attempt_at <= now())
      or (status='sending' and locked_until <= now()));
  $job$
);
