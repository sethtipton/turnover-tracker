# Turnover Tracker

Turnover Tracker is a small rental turnover app built as a public portfolio/demo project with a private family workspace behind Google sign-in.

Work is organized as `workspace -> property -> optional unit`. A property-level scope is available for shared work such as roofs, siding, utilities, and grounds; unit scopes hold work specific to an upstairs, downstairs, or main unit. Existing flat unit records are migrated into this hierarchy without moving their tasks into the property-level scope.

## Product

Turnover Tracker is a property operations intelligence system for understanding the physical state of a property and coordinating the work required to maintain it.

It is a multi-property rental operations platform built with React, Vite, and Supabase. It supports role-based workspaces, property- and unit-level task management, attachment storage, public rental listings, and server-side AI workflows that turn voice walkthroughs into reviewable tasks and materials.

## Core Workflows

- Track approved, pending-review, and completed work by property or unit.
- Manage Shopping List and Collect / Bring materials alongside tasks.
- Attach photos, files, and dictated audio to work items.
- Drag active tasks to reorder them on desktop; use the Up and Down controls for touch and keyboard-friendly ordering. Completed tasks remain at the bottom of the list.
- Publish public-facing rental listings independently from the private operational workspace.
- Store dictated audio and process it with Supabase Edge Functions into reviewable task and material drafts.

## Stack

- Vite + React
- Supabase Auth, Postgres, and Storage
- GitHub Pages for static hosting

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with the Supabase project URL and anon/publishable key.

## Supabase Setup

Project created:

```text
Turnover Tracker
https://gholbnyvijfyqdwqgjan.supabase.co
```

1. For a new project, run `supabase/schema.sql` in the Supabase SQL Editor. Its bootstrap alignment section mirrors the later schema migrations, including property access, public listings, and Phase 4. For an existing project, apply the versioned migrations in `supabase/migrations` instead.
2. In Authentication > URL Configuration, set the Site URL:
   - `https://sethtipton.github.io/turnover-tracker`
3. Add these redirect URLs in Authentication > URL Configuration:
   - `http://localhost:5173/`
   - `http://localhost:5173/turnover-tracker/`
   - `http://127.0.0.1:5173/turnover-tracker/`
   - `https://sethtipton.github.io/turnover-tracker/`
4. Enable Google auth in Authentication > Sign In / Providers > Google.
5. Create Google OAuth credentials in Google Cloud and paste them into Supabase:
   - Authorized redirect URI: `https://gholbnyvijfyqdwqgjan.supabase.co/auth/v1/callback`
   - Authorized JavaScript origins:
     - `http://localhost:5173`
     - `http://127.0.0.1:5173`
     - `https://sethtipton.github.io`
6. Copy the project URL and publishable key into `.env.local`.

Google auth is configured for the hosted app and local Vite development. While the Google OAuth app is in testing mode, family accounts must be listed as Google test users before they can sign in.

Workspace access is stored in `public.workspace_members`. The initial Tipton Rentals members are seeded by the schema and membership migration. Owners can manage membership; editors can update units, tasks, materials, and attachments; viewers have read-only access.

## OpenAI Credential Setup

Do not put an OpenAI API key in any `VITE_` environment variable. Vite variables are bundled into the public browser app, so the key must stay server-side.

The app uses Supabase Edge Functions at `supabase/functions/draft-tasks`, `supabase/functions/draft-listing-copy`, `supabase/functions/process-maintenance-request`, and `supabase/functions/submit-maintenance-request` to keep sensitive processing server-side. They read:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_TRANSCRIPTION_MODEL
```

`process-maintenance-request` also uses Supabase's server-only `SUPABASE_SERVICE_ROLE_KEY` after first validating the caller through RLS. Never expose that key to Vite or a browser environment.

For local Supabase function development:

```bash
cp supabase/.env.example supabase/.env
```

Then replace the placeholder values in `supabase/.env`.

For hosted Supabase:

```bash
supabase secrets set OPENAI_API_KEY="your-real-key" OPENAI_MODEL="gpt-4.1-mini" OPENAI_TRANSCRIPTION_MODEL="gpt-4o-transcribe" --project-ref gholbnyvijfyqdwqgjan
supabase functions deploy draft-tasks draft-listing-copy process-maintenance-request --project-ref gholbnyvijfyqdwqgjan
supabase functions deploy submit-maintenance-request --no-verify-jwt --project-ref gholbnyvijfyqdwqgjan
```

For GitHub-managed deployment, add these repository secrets in GitHub > Settings > Secrets and variables > Actions:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_REF
OPENAI_API_KEY
```

Optionally add this repository variable:

```text
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe
```

Then run the manual `Deploy Supabase Functions` workflow from the GitHub Actions tab. `draft-tasks` remains available for legacy dictation. `process-maintenance-request` is the Phase 4 intake pipeline: it preserves request audio, transcribes request voice entries, writes immutable analysis snapshots, safely splits admin walkthroughs, and creates idempotent pending-review work proposals. `draft-listing-copy` produces editable, fact-grounded suggestions for listing headlines, descriptions, and amenities; it never saves or publishes a listing.

## Maintenance requests

Apply `supabase/migrations/20260806160000_maintenance_requests.sql` before deploying the Phase 4 function. The migration adds unit-scoped tenant memberships, maintenance case files, immutable analyses, request-specific media, and RLS policies. Tenant accounts are intentionally not workspace or property members; create an active `tenant_memberships` row for each tenant/unit relationship. Internal users can open **Maintenance requests** and use the clearly labelled **Tenant view preview** without weakening tenant RLS.

Apply `supabase/migrations/20260806170000_property_admin_maintenance_access.sql` as well. A property-level `admin` can then open the maintenance console and sees only their authorized properties, requests, and units; workspace-wide people/access controls remain unavailable.

Authenticated tenant memberships remain available for the signed-in tenant portal, but they are not required for QR intake. Google OAuth remains the only admin authentication mechanism; the QR capability does not create or imply a tenant identity.

Apply `supabase/migrations/20260807090000_maintenance_qr_codes.sql`, `20260807100000_maintenance_qr_function_grants.sql`, and then `20260813100000_public_maintenance_capabilities.sql`. The last migration retires the legacy plaintext `/m/:token/` values, so existing cards intentionally stop working and each active unit needs a fresh printed card. The new public URL is `/maintenance/q/:long-random-token/`.

An admin generates or rotates a unit code from **Maintenance requests**. The server creates a 256-bit URL-safe capability, persists only its SHA-256 hash, and returns the plaintext once for that browser session so it can be copied or printed. Rotation replaces the stored hash and invalidates the old card immediately; disabling a code invalidates it without retaining a route back to operational data. Generating a replacement always creates a new secret.

The QR page calls only `submit-maintenance-request`, which validates and hashes the supplied capability server-side, resolves the unit/property/workspace there, and uses service-role writes only after that validation. The browser cannot select a unit or write directly to maintenance tables or Storage. The maintenance bucket remains private; photos and audio are MIME-, count-, and size-validated and uploaded by the Edge Function to a server-generated path. QR possession permits one new request for that unit and nothing else: it cannot read units, properties, tenant memberships, maintenance history, notes, AI analyses, tasks, materials, or attachment URLs. The v1 flow intentionally does not expose a request-status capability.

Set `VITE_PUBLIC_APP_URL` in `.env.local` when printable cards must point to a production URL while developing locally. Set `SUPABASE_SERVICE_ROLE_KEY` only in the Edge Function environment (`supabase/.env` for local function serving or Supabase secrets for hosted deployment), never in a `VITE_` value.

## Deploy

The app is configured for GitHub Pages at:

```text
https://sethtipton.github.io/turnover-tracker/
```

```bash
npm run build
git push origin main
```

GitHub Actions builds and deploys the app to GitHub Pages after each push to `main`.
