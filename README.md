# Turnover Tracker

Turnover Tracker is a small rental turnover app built as a public portfolio/demo project with a private family workspace behind Google sign-in.

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

1. For a new project, run `supabase/schema.sql` in the Supabase SQL Editor. For the existing project, apply the versioned migrations in `supabase/migrations`.
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

The app uses a Supabase Edge Function at `supabase/functions/draft-tasks` to keep OpenAI calls server-side. It reads:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_TRANSCRIPTION_MODEL
```

For local Supabase function development:

```bash
cp supabase/.env.example supabase/.env
```

Then replace the placeholder values in `supabase/.env`.

For hosted Supabase:

```bash
supabase secrets set OPENAI_API_KEY="your-real-key" OPENAI_MODEL="gpt-4.1-mini" OPENAI_TRANSCRIPTION_MODEL="gpt-4o-transcribe" --project-ref gholbnyvijfyqdwqgjan
supabase functions deploy draft-tasks --project-ref gholbnyvijfyqdwqgjan
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

Then run the manual `Deploy Supabase Functions` workflow from the GitHub Actions tab. The function transcribes saved dictation audio, creates pending-review tasks/materials from the transcript, and stores the transcript on the original dictation item.

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
