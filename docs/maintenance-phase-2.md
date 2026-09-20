# Maintenance email pilot

Phase 2 adds a private email outbox alongside the existing admin inbox. Only successfully finalized public QR submissions enqueue alerts. Existing requests are not backfilled. Property admins must explicitly opt in through property_members.maintenance_email_enabled; the default is false. Delivery is disabled unless MAINTENANCE_EMAIL_ENABLED is exactly true.

Emails contain the property, request text, supplied contact details, photo/audio counts, and an authenticated View request link. Main Unit is omitted. Attachments stay in the app. Reply-To uses a valid supplied tenant email; replies stay in email and are not stored in the app.

## Activation

1. Complete Resend signup and add notifications.treecityrentals.com. Copy its exact DNS records into Bluehost and wait for verification. Do not change the website's nameservers, root MX, or GitHub Pages settings.
2. Create a sending key restricted to the verified domain. Configure Supabase secrets securely: RESEND_API_KEY, MAINTENANCE_EMAIL_FROM (Tree City Rentals <maintenance@notifications.treecityrentals.com>), PUBLIC_APP_URL (https://sethtipton.github.io/turnover-tracker/), MAINTENANCE_EMAIL_JOB_SECRET (random 32+ characters), MAINTENANCE_EMAIL_ENABLED=false. Never place keys in frontend variables or git.
3. Store the worker URL and matching job secret in Supabase Vault under the names documented in supabase/operations/schedule-maintenance-emails.sql, then run that script. It installs a once-per-minute queue check. The scheduler is deliberately separate from migrations so deployment cannot activate sending prematurely.
4. Enable maintenance_email_enabled only for sethtipton@gmail.com's existing admin membership at 469 Carthage, after verifying the exact property/workspace IDs. Leave other admins disabled.
5. Set MAINTENANCE_EMAIL_ENABLED=true. Submit one clearly labeled Carthage pilot test with text, contact details and media. Confirm one inbox case, one queue row, and one email in Gmail. Check attachment counts, Reply-To and View request both signed in and after sign-in. Replaying the same submission must not produce a second notification.

## Verification and operations

- npm test: form receipt/recording and email rendering, authorization, pause, retry payload stability, temporary/permanent provider failures, recipient revocation and lost acknowledgments; routing identifier validation.
- npm run lint; npm run build.
- node scripts/test-maintenance-db.mjs --linked --rehearse: pending migrations and fixtures roll back. Tests cover RLS, atomic intake and email queue mechanics. Email database tests refuse to run while real deliveries are pending; pause the worker and wait for an empty queue before rerunning.
- After applying migrations, repeat without --rehearse.
- GitHub Pages deployment first checks that migrations exist, then deploys the worker and frontend.
- The worker logs request/delivery IDs, attempt numbers and sanitized error codes, never request text, contact details, tokens or provider response bodies.
- status=sent means Resend accepted the email, not confirmed mailbox delivery. Check Resend delivery/bounce events and Gmail for the pilot. No bounce webhook or dashboard is included in this small first rollout.
- A worker handles up to five emails per invocation. Failed temporary sends back off up to eight attempts, with a two-minute lease. The saved provider payload and idempotency key stay fixed. Automatic retries stop within 23 hours of the first attempt to avoid duplicating mail beyond Resend's 24-hour idempotency window.
- Review failed rows and provider records before any manual retry. Never blindly reset an ambiguous old delivery.
- Stop sending with MAINTENANCE_EMAIL_ENABLED=false; disable recipient opt-in to cancel outstanding alerts for that recipient. Public requests and the admin inbox continue working.
- Account creation, sender verification, scheduler activation and actual inbox delivery must be reported separately from passing mocked tests. Until completed, phase 2 is deployed but not activated.

## Pilot results — September 20, 2026

Phase 2 is active for sethtipton@gmail.com at 469 Carthage only. Other memberships remain opted out. The website remains on GitHub Pages; phase 3 has not started.

- Added three Bluehost DNS records at the existing default four-hour TTL: TXT resend._domainkey.notifications (Resend DKIM public key), CNAME rsend.notifications → rsend.forge.rmta.net, and CNAME send.notifications → send.forge.rmta.net. Existing root website, mail and nameserver records were unchanged.
- Resend verified notifications.treecityrentals.com. Sender is Tree City Rentals <maintenance@notifications.treecityrentals.com>.
- The API key and worker job secret are in Supabase server secrets; the scheduler reads its credentials from Vault. No credentials are committed.
- Enabled the scheduled worker and only Seth's existing Carthage admin membership. pg_cron runs every minute, invoking the worker only when delivery is due.
- Anonymous pilot submission returned 201; identical replay returned 200. Exactly one case and one email notification were created, with one photo and one audio attachment.
- Case f8319daa-d112-4ef4-bfce-b2d342950955 is labeled [Phase 2 TEST] Carthage email pilot. Synthetic test only; no repair needed. It is retained for review.
- The scheduled worker sent the queued notification on its first attempt. Resend reported delivered; Gmail visibly received it. No manual worker invocation was needed.
- Gmail showed the intended sender, tenant Reply-To (a test alias of Seth's Gmail), request text, supplied contact fields, 1 photo / 1 voice message, and the correct authenticated View request URL. The published inbox opened the matching case with its media. Google sign-in return routing was verified during deployment.
- IMPORTANT: Gmail classified this first branded email as Spam. It displayed the expected mailed-by and signed-by domains and TLS. Provider delivery is proven; reliable inbox placement is not. Mark the legitimate pilot message “Report not spam” and retest before relying on email alone. The app inbox remains the authoritative request record.
- Live worker authorization checks: invalid authorization returned 401; valid authorization while disabled returned 200 with paused=true.
- Validation from deployment: 62 app tests, database RLS/intake/outbox checks, lint and build passed. Build retains the pre-existing bundle-size warning.
