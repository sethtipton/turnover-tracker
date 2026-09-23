# Rental inquiry dialog — backend deployed, frontend local

Local `main` contains a Contact for rent button on listing cards and listing detail views. It opens a native modal with name, email, and message. The button is absent unless the server reports a published Available/Coming soon listing with at least one valid property-admin email. Admin addresses are never returned to the browser. Exact advertised rent still displays normally.

Submitting saves an inquiry and separately queues one email per distinct assigned property-admin email. Workspace ownership alone is not a recipient assignment; viewers and blank/invalid addresses are excluded. Maintenance email opt-in is not consulted. Emails use the existing verified sender, visitor Reply-To and a listing link. The receipt says notifications are queued rather than promising inbox delivery.

The new outbox uses the maintenance worker's lease, frozen payload, per-recipient idempotency, retry/backoff and recipient revalidation design, in separate tables/functions. It retries up to eight attempts within 23 hours. The intake endpoint validates listing eligibility and input bounds, uses a honeypot, and limits submissions by hashed IP to five per hour. Submission IDs make uncertain client retries idempotent. Inquiry content and addresses are private; no admin inquiry dashboard is included in this phase.

## Verification

- Database migration and recipient tests executed together in one transaction, then rolled back. Tested missing-recipient availability, two distinct property admins, viewer/blank exclusions, duplicate submission suppression, and unpublished-listing behavior. No inquiry schema or queues are deployed.
- Unit/component tests cover unavailable-button hiding, retained client payload on retry, validation, rate-limit responses, worker authentication/paused mode, frozen provider retries, permanent/retryable delivery failures and escaped email/Reply-To.
- Local browser fixture at `/turnover-tracker/tests/browser/inquiry.html` exercises the real dialog with a simulated sender; it never sends mail. Desktop and 390 × 844 mobile viewport checked. Initial field focus, native modal containment, Escape/return focus, failure and retry success checked. Physical iPhone keyboard behavior remains a device check.
- One real email built by the new template was sent ONLY to sethtipton@gmail.com. Resend ID `01a0c4ef-aef7-73c8-80cd-fc7500648bbd` reports Delivered and shows Reply-To sethtipton@gmail.com. This checks provider delivery/template, not the unpublished scheduler end to end. Gmail search did not locate it during the check; inbox-versus-spam placement is unconfirmed.

## Publication checklist (requires user approval)

1. Apply `20260921100000_listing_inquiries.sql` and deploy the two new functions with JWT verification disabled; worker verifies its dedicated scheduler secret.
2. Set `LISTING_INQUIRY_RATE_SECRET` to a random server-only secret. Keep `LISTING_INQUIRIES_ENABLED` disabled until final controlled checks are complete. Reuse existing Resend/sender/job secret settings.
3. Configure Vault `listing_inquiry_worker_url`, then run `supabase/operations/schedule-listing-inquiries.sql`. It uses the existing maintenance job secret but a separate schedule and queue.
4. Add both functions to the explicit CI deployment list. The database `listing_inquiry_settings.enabled` flag defaults to false and hides the contact action. After delivery is configured, enable that flag and the server environment flag, then and smoke-test the real submit-to-queue-to-worker flow using a controlled property with only the approved test recipient.
5. Commit/push the reviewed frontend on main after approval, and verify the live dialog and sender/reply behavior.

No inquiry migration, functions, scheduler, frontend deployment or recipient settings were published during this work. Earlier listing-image migrations remain applied from the previous phase.

## Backend-only rollout, September 21

Applied the inquiry migration, deployed submit-listing-inquiry and deliver-listing-inquiries, configured the server-only rate secret and enabled both the environment and database switches. Installed a separate once-per-minute scheduler using the existing private worker authentication secret. No GitHub push or Pages deployment occurred. The local main branch also includes the new functions in the next CI deployment list.

A real signed-out local Carthage submission showed the receipt and created inquiry `8de6c94e-2c99-43fb-96ff-566849011347`. Four property admins were selected; before scheduling delivery, the three non-Seth test notifications were cancelled explicitly. Recipient assignments were unchanged. Normal new inquiries notify all eligible assigned property admins.

Fixed React StrictMode development effect cleanup closing the dialog immediately; real local dialog and receipt verified. 90 tests, lint and build passed. GitHub main remains `97e660ad42f6e9e101c4ac2bb5c530f38cb64c5a`.

The first live cron run exposed a stale opt-in column reference in the copied recipient recheck. Applied follow-up migration `20260921110000_fix_inquiry_recipient_recheck.sql`; transactional claim/prepare/finish checks passed afterward. The scheduler then sent the controlled email on its first claimed attempt. Resend `01a0c6b9-30d4-7433-a004-b3d44d97d65b` confirmed Delivered and correct Reply-To. No email was sent to the other three admins for this synthetic inquiry.

Backend publication checklist items are now complete; remaining publication is the reviewed frontend/CI commit and push. The earlier undeployed statements above describe the pre-rollout validation stage.
