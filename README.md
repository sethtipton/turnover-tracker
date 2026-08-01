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

1. In Supabase SQL Editor, run `supabase/schema.sql`.
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

Google auth is intentionally the remaining manual setup step because Supabase requires a Google OAuth Client ID and Client Secret.

## Deploy

The app is configured for GitHub Pages at:

```text
https://sethtipton.github.io/turnover-tracker/
```

```bash
npm run build
npm run deploy
```
