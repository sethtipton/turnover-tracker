# Custom domain rollout

GitHub Pages remains the host. Main-branch pushes run the existing Actions build/backend/Pages workflow; there is no FTP deployment.

## Changes

- Production Vite base is `/`. Local development retains `/turnover-tracker/` so existing development tabs continue working.
- At the production root, the app normalizes legacy `/turnover-tracker/` paths before rendering, preserving query strings and fragments.
- GitHub Pages custom domain is treecityrentals.com. Its Actions deployment does not depend on the CNAME artifact, which also records the intended domain.
- Bluehost apex A records: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153. www CNAME points to sethtipton.github.io.
- cpanel, ftp and webmail CNAMEs previously pointed to the apex. They now point to mail.treecityrentals.com, which retains the original Bluehost IP 162.241.217.135. This preserves their DNS destination while moving the website.
- Existing MX, mail A record, WordPress cms records, Resend verification records and nameservers are retained. Bluehost files are not deleted or overwritten. FTP workflows using the bare apex as their FTP server must use ftp.treecityrentals.com or the original Bluehost server instead.
- Supabase Site URL is https://treecityrentals.com. Redirect allowlist includes https://treecityrentals.com/**, the old GitHub project path, and existing localhost/127.0.0.1 development paths.
- PUBLIC_APP_URL is https://treecityrentals.com/. Previously queued emails keep their frozen payload and original URL to preserve idempotency.

## Validation and completion

62 tests, lint and the production build passed. GitHub deployment run 35514914692 succeeded. GitHub's DNS health check accepts both apex and www and reports them eligible for HTTPS. The certificate was approved for apex and www; HTTPS enforcement is enabled. Public-browser verification passed; authenticated Google return verification is awaiting sign-in in the in-app browser.

During certificate provisioning, maintenance email delivery was briefly paused and has now resumed. Public submissions still persist and queue alerts for the enabled Carthage admin. After valid HTTPS is available, enforce HTTPS in Pages and restore MAINTENANCE_EMAIL_ENABLED=true. Test a fresh signed-out submission on the custom domain, its email link, Google login return, original QR URL, and Gmail inbox placement after the pilot was marked not spam. Do not rotate the pilot QR token merely because the domain changed. Do not enable other properties until recipient assignments are confirmed.

## Rollback

Restore apex A to 162.241.217.135 and www CNAME to treecityrentals.com to serve the previous Bluehost website. Restore the GitHub Pages custom-domain setting and production base together if returning the app to the GitHub project URL; revert the domain rollout commit. Restore Supabase Site URL and PUBLIC_APP_URL to the prior GitHub address. Keep email paused until the destination is verified. DNS caches may retain either address for the previous four-hour TTL.


## Live checks

- Signed-out QR form loaded at https://treecityrentals.com with a 390 × 844 viewport, no horizontal overflow and a one-line heading. This is a desktop browser viewport test, not a physical iPhone microphone test.
- A real browser submission with description, contact details and one photo produced the detailed receipt. Case e29f4f0c-dc8f-46bb-b3ac-1debf41eb046 is labeled [Phase 3 TEST] Custom domain and inbox placement; no repair is needed.
- The scheduled worker sent its email on the first attempt. Gmail shows the new message in Inbox (the earlier phase 2 message was marked not spam by Seth). The new email contains the custom-domain request link and correct photo count/contact details.
- The original GitHub Pages QR URL redirects to the matching HTTPS custom-domain QR path. Token rotation is unnecessary.
- Chrome retained the previous Bluehost DNS destination during testing. The in-app browser reached the new site correctly. Browser policy blocked an attempt to clear Chrome DNS cache; no workaround was used. Chrome should update when cached DNS/connection state expires.
- Google OAuth starts with the correct new-domain return destination. The in-app browser needs the user to sign into Google to complete the return test.
