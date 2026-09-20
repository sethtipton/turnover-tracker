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

## Setup progress — September 20, 2026

- Resend account connected; server API key and worker job secret stored in Supabase secrets.
- Created notifications.treecityrentals.com in Resend; domain verification still pending Bluehost DNS setup.
- Installed pg_cron and pg_net and the deliver-maintenance-emails job (once per minute). Worker credentials are read from Vault.
- A connection test from onboarding@resend.dev was accepted by Resend and visibly received in Gmail. This verifies the provider connection, not the complete maintenance workflow or branded sender.
- Live worker checks: invalid authorization returns 401; valid authorization while disabled returns 200 with paused=true.
- Maintenance delivery remains disabled and all recipient opt-ins remain false until sender verification and the Carthage pilot.
