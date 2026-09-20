# Public maintenance intake — phase 1

A unit QR link accepts a new request without tenant sign-in. Text, optional contact
information, photos, and audio are saved to the existing admin maintenance inbox.
Email alerts are phase 2; the receipt confirms storage, not notification delivery.
AI analysis remains an authenticated admin action.

## Deployment

1. Back up affected unit/request records before applying migrations. The public
   capability migration retires legacy `/m/` cards; issue replacement cards.
2. Run `npm test`, `npm run lint`, and `npm run build`.
3. Rehearse unapplied migrations and database tests without retaining changes:
   `node scripts/test-maintenance-db.mjs --linked --rehearse`.
4. Apply reviewed migrations with `supabase db push --linked`.
5. Run `node scripts/test-maintenance-db.mjs --linked` against the deployed schema.
6. Push the release to main. Pages runs application tests and waits for the
   backend workflow, which checks migration versions and deploys functions.
   A pending migration blocks the frontend deployment.
7. Test the live QR route and inbox using clearly labeled test requests.

Database tests use fixture records inside transactions and always roll back.
They run on the configured linked database; `--rehearse` briefly exercises schema
changes in that transaction. Do not run rehearsals during busy production traffic.

## Live verification

- Open the Carthage QR link without signing in; confirm the property and unit.
- Submit a labeled text/photo/audio test. Verify one case, the correct scope,
  readable photo, playable audio, and reporter information in the admin inbox.
- Repeat the same submission ID/payload; expect success with no second case.
- In the admin inbox, use Refresh inbox or return to the tab to see new cases.
- Analyze request is available for requests that have no analysis yet.
- Confirm anonymous database reads do not disclose requests or attachments.
- Test recording permission/finalization on a physical phone before broad rollout.

## Retry and logging behavior

The form retains a submission UUID and its exact payload while a response is
uncertain. The server binds that UUID to the unit and a hash of the payload,
including attachment bytes. Different payloads or units cannot reuse it.

A server-only receipt reserves the case ID. Staged files remain private until an
atomic database function inserts the case, entries, and attachment metadata.
An active attempt blocks concurrent duplicates; a failed attempt can retry
immediately, and an abandoned attempt can be reclaimed after ten minutes.

Finalization and failure handling lock the receipt, so a lost finalization
response cannot cause committed attachments to be deleted. A retry reuses the
same case ID and cleans the prior attempt's staged files. Cleanup failures are
logged; files from a terminated attempt remain staged until that request retries.

Function logs use `public-maintenance-intake` with stage, correlation ID,
submission/case IDs, attachment count, duration, and sanitized error code. They
do not log bearer tokens, request text, contact information, or media URLs.

## QR cards

Only enable the Carthage pilot initially. Full links are displayed once when a
code is generated; use Print → Save as PDF before leaving the page. Rotating a
code invalidates earlier cards immediately. Keep the current GitHub Pages base
URL for this release; website-domain migration is a separate change.
